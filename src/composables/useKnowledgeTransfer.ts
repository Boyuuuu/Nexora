import { computed, ref, shallowRef } from 'vue'
import {
  describeSnapshot, exportBackupSnapshot, exportNoteSnapshot, exportWorkspaceSnapshot,
  importSnapshot, readSnapshotBlob, SnapshotError, snapshotFilename, snapshotToBlob,
  type ImportMode, type ImportSummary, type Snapshot,
} from '../data'
import { useKnowledgeStore, type WorkspaceNoteSummary } from '../stores/knowledgeStore'
import { useWorkspaceUi } from './useWorkspaceUi'

export type TransferKind = 'export' | 'import'
type ExportScope = 'workspace' | 'note' | 'all'

function downloadSnapshot(snapshot: Snapshot): void {
  const url = URL.createObjectURL(snapshotToBlob(snapshot))
  const link = document.createElement('a')
  link.href = url
  link.download = snapshotFilename(snapshot)
  link.hidden = true
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    // Allow the browser to start reading the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function describeError(error: unknown): string {
  if (error instanceof SyntaxError) return '文件无法读取，请选择有效的 JSON 备份文件。'
  if (error instanceof SnapshotError) {
    return {
      INVALID_FORMAT: '这不是 Nexora 备份文件，请重新选择。',
      UNSUPPORTED_VERSION: '这份备份来自更新的版本，请更新应用后再导入。',
      INVALID_SNAPSHOT: '备份文件内容不完整或格式有误，请重新选择。',
      BROKEN_REFERENCE: '备份文件中的内容关联不完整，无法导入。',
      IMPORT_CONFLICT: '备份对应的数据已存在。请选择导入副本，或在恢复模式下允许替换已有内容。',
      MISSING_TARGET: '请先选择接收笔记的 Workspace。',
    }[error.code]
  }
  return '操作未完成，请重试。所选内容可能已发生变化。'
}

/** Transfer choices are local to the dialog and never navigate the editor. */
export function useKnowledgeTransfer(download = downloadSnapshot) {
  const store = useKnowledgeStore()
  const ui = useWorkspaceUi()
  const scope = ref<ExportScope>('workspace')
  const workspaceId = ref('')
  const noteId = ref('')
  const notes = ref<WorkspaceNoteSummary[]>([])
  const loading = ref(false)
  const notesLoading = ref(false)
  const busy = ref(false)
  const problem = ref('')
  const notice = ref('')
  const picked = shallowRef<Snapshot | null>(null)
  const filename = ref('')
  const mode = ref<ImportMode>('copy')
  const overwrite = ref(false)
  const targetId = ref('')
  const imported = shallowRef<ImportSummary | null>(null)
  let sessionVersion = 0
  let notesVersion = 0

  const preview = computed(() => picked.value ? describeSnapshot(picked.value) : null)
  const hasWorkspace = computed(() => store.workspaces.value.some((item) => item.id === workspaceId.value))
  const locked = computed(() => busy.value || loading.value || store.busy.value)
  const canExport = computed(() => !locked.value && (scope.value === 'all'
    ? store.workspaces.value.length > 0
    : hasWorkspace.value && (scope.value !== 'note' || !notesLoading.value && notes.value.some((item) => item.id === noteId.value))))
  const canImport = computed(() => !locked.value && !!picked.value && !imported.value && (picked.value.kind !== 'note'
    || store.workspaces.value.some((item) => item.id === targetId.value)))

  async function selectWorkspace(id: string, preferredNoteId = ''): Promise<void> {
    const version = ++notesVersion
    workspaceId.value = id
    noteId.value = ''
    notes.value = []
    problem.value = ''
    notice.value = ''
    notesLoading.value = true
    try {
      const list = id ? await store.listWorkspaceNotes(id) : []
      if (version !== notesVersion) return
      notes.value = list
      noteId.value = list.find((item) => item.id === preferredNoteId)?.id ?? list[0]?.id ?? ''
    } catch (error) {
      if (version === notesVersion) problem.value = describeError(error)
    } finally {
      if (version === notesVersion) notesLoading.value = false
    }
  }

  async function initialize(): Promise<void> {
    const version = ++sessionVersion
    notesVersion++
    loading.value = true
    notesLoading.value = false
    scope.value = 'workspace'
    workspaceId.value = ''; noteId.value = ''; notes.value = []
    picked.value = null; filename.value = ''; imported.value = null
    mode.value = 'copy'; overwrite.value = false; targetId.value = ''
    notice.value = ''; problem.value = ''
    try {
      await store.loadWorkspaces()
      if (version !== sessionVersion) return
      if (store.lastError.value) throw new Error(store.lastError.value)
      const id = store.workspaces.value.find((item) => item.id === store.workspace.value?.id)?.id ?? store.workspaces.value[0]?.id ?? ''
      targetId.value = id
      await selectWorkspace(id, store.note.value?.id)
    } catch (error) {
      if (version === sessionVersion) problem.value = describeError(error)
    } finally {
      if (version === sessionVersion) loading.value = false
    }
  }

  function dispose(): void { sessionVersion++; notesVersion++ }

  async function exportFile(): Promise<boolean> {
    if (!canExport.value) return false
    busy.value = true; problem.value = ''; notice.value = ''
    try {
      const snapshot = scope.value === 'all' ? await exportBackupSnapshot()
        : scope.value === 'note' ? await exportNoteSnapshot(noteId.value)
        : await exportWorkspaceSnapshot(workspaceId.value)
      download(snapshot)
      notice.value = '已导出，文件已交给浏览器下载。'
      return true
    } catch (error) {
      problem.value = describeError(error)
      return false
    } finally { busy.value = false }
  }

  async function selectFile(file: File): Promise<void> {
    if (locked.value) return
    busy.value = true; picked.value = null; imported.value = null
    filename.value = file.name; notice.value = ''; problem.value = ''
    mode.value = 'copy'; overwrite.value = false
    try { picked.value = await readSnapshotBlob(file) }
    catch (error) { problem.value = describeError(error) }
    finally { busy.value = false }
  }

  async function importFile(): Promise<boolean> {
    if (!canImport.value || !picked.value) return false
    busy.value = true; problem.value = ''; notice.value = ''
    try {
      imported.value = await importSnapshot(picked.value, {
        mode: mode.value,
        overwrite: mode.value === 'restore' && overwrite.value,
        ...(picked.value.kind === 'note' ? { workspaceId: targetId.value } : {}),
      })
      // Import has committed. A refresh failure must not invite a duplicate import.
      notice.value = `导入完成 · ${imported.value.noteIds.length} 篇笔记 · ${imported.value.blocks} 个 Block`
      await store.reload()
      if (store.lastError.value) problem.value = '导入已完成，但目录刷新失败，请刷新页面查看。'
      if (ui.selectedBlockId.value && !store.blocks.value.some((item) => item.id === ui.selectedBlockId.value)) ui.selectBlock(null)
      if (ui.selectedNodeId.value && !store.graph.value.nodes.some((item) => item.id === ui.selectedNodeId.value)) ui.selectNode(null)
      if (ui.selectedEdgeId.value && !store.graph.value.edges.some((item) => item.id === ui.selectedEdgeId.value)) ui.selectEdge(null)
      return true
    } catch (error) {
      problem.value = describeError(error)
      return false
    } finally { busy.value = false }
  }

  return { store, scope, workspaceId, noteId, notes, loading, notesLoading, busy, locked,
    problem, notice, picked, filename, mode, overwrite, targetId, imported, preview,
    canExport, canImport, initialize, dispose, selectWorkspace, selectFile, exportFile, importFile }
}
