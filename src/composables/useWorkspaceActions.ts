import type { Block, BlockType, GraphEdgeType, GraphNodePosition, GraphNodeType } from '../data'
import { createId } from '../data'
import type { BlockChanges, Operation, OperationResult } from '../operations'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { defaultBlockInput, duplicateBlockInput } from '../workspace/blockDefaults'
import { blockTitle, nodeTypeFromBlock } from '../workspace/labels'
import { friendlyOperationError, logOperationFailure } from '../workspace/operationErrors'
import { useWorkspaceUi } from './useWorkspaceUi'
import { useAiEditor } from './useAiEditor'
import { blockMoveAnchor, type BlockPlacement } from '../workspace/blockReorder'
import { hasPendingNoteDrafts } from '../workspace/noteDrafts'

export function useWorkspaceActions() {
  const store = useKnowledgeStore()
  const ui = useWorkspaceUi()

  function workspaceId(): string | null {
    return store.workspace.value?.id ?? null
  }

  function noteId(): string | null {
    return store.note.value?.id ?? null
  }

  async function run(operation: Operation, friendly?: string): Promise<OperationResult> {
    const result = await store.run(operation)
    if (!result.success) {
      logOperationFailure(operation.operation, result.error?.code, result.error?.message)
      ui.showToast(friendly ?? friendlyOperationError(operation.operation))
    }
    return result
  }

  async function failGuard<T>(work: () => Promise<T | null>, friendly: string): Promise<T | null> {
    const value = await work()
    if (value === null && store.lastError.value) {
      if (import.meta.env.DEV) {
        console.warn('[nexora:store]', store.lastError.value)
      }
      ui.showToast(friendly)
    }
    return value
  }

  async function openNote(id: string): Promise<void> {
    await store.selectNote(id)
    ui.touchRecent(id)
    ui.setMode('note')
    ui.selectBlock(null)
  }

  async function openCanvas(nodeId?: string): Promise<void> {
    ui.setCanvasScope({ type: 'workspace' })
    ui.setMode('canvas')
    if (nodeId) {
      ui.requestFocusNode(nodeId)
      ui.selectNode(nodeId)
    }
  }

  async function switchToWorkspace(id: string): Promise<boolean> {
    if (store.workspace.value?.id === id) return true
    await store.selectWorkspace(id)
    if (store.lastError.value || store.workspace.value?.id !== id) {
      ui.showToast('暂时无法打开这个工作区，请重试。')
      return false
    }
    ui.clearSelection()
    ui.requestFocusNode(null)
    return true
  }

  async function createWorkspaceNote(id: string): Promise<boolean> {
    const created = await failGuard(
      () => store.createNote(id, 'Untitled'),
      'Could not create a note.\nPlease try again.',
    )
    if (!created) return false
    ui.clearSelection()
    ui.requestFocusNode(null)
    ui.touchRecent(created.id)
    ui.setMode('note')
    return true
  }

  async function reorderBlock(draggedId: string, placement: BlockPlacement, originNoteId: string): Promise<boolean> {
    const current = store.note.value
    if (!current || current.id !== originNoteId || current.workspaceId !== store.workspace.value?.id) return false
    const anchor = blockMoveAnchor(current.blocks.map((block) => block.id), draggedId, placement)
    if (anchor === undefined) return false
    if (hasPendingNoteDrafts(current)) { ui.showToast('请等待正文保存后再拖动排序。'); return false }
    const expected = JSON.parse(JSON.stringify(current))
    try {
      // One atomic move preserves all block content and does not navigate after a background save.
      await store.runBlockBatch(expected, [{ operation: 'move_block', workspace_id: current.workspaceId, note_id: current.id, block_id: draggedId, after_block_id: anchor }])
      if (store.note.value?.id === originNoteId) ui.selectBlock(draggedId)
      ui.showToast('Block 顺序已保存。')
      return true
    } catch {
      ui.showToast('暂时无法保存顺序，笔记可能已变化。请重新打开笔记后再试。')
      return false
    }
  }

  return {
    store,
    ui,

    async bootstrap(): Promise<void> {
      await store.loadWorkspaces()
    },

    async selectWorkspace(id: string): Promise<void> {
      await store.selectWorkspace(id)
      const first = store.notes.value[0]
      if (first) {
        await openNote(first.id)
      } else {
        await store.selectNote(null)
        ui.setMode('note')
      }
    },

    openNote,
    openCanvas,
    createWorkspaceNote,
    reorderBlock,

    async openWorkspaceNote(workspaceId: string, id: string): Promise<boolean> {
      if (!await switchToWorkspace(workspaceId)) return false
      if (!store.notes.value.some((item) => item.id === id && item.workspaceId === workspaceId)) {
        ui.showToast('这篇笔记已不存在，请刷新目录后重试。')
        return false
      }
      await store.selectNote(id)
      if (store.lastError.value || store.note.value?.id !== id) {
        ui.showToast('暂时无法打开这篇笔记，请重试。')
        return false
      }
      ui.touchRecent(id)
      ui.setMode('note')
      ui.selectBlock(null)
      return true
    },

    async openWorkspaceCanvas(id: string): Promise<boolean> {
      if (!await switchToWorkspace(id)) return false
      ui.setCanvasScope({ type: 'workspace' })
      ui.setMode('canvas')
      return true
    },

    async openWorkspaceNoteCanvas(workspaceId: string, noteId: string): Promise<boolean> {
      if (!await switchToWorkspace(workspaceId)) return false
      if (!store.notes.value.some((item) => item.id === noteId && item.workspaceId === workspaceId)) {
        ui.showToast('这篇笔记已不存在，请刷新目录后重试。')
        return false
      }
      await store.selectNote(noteId)
      if (store.lastError.value || store.note.value?.id !== noteId) return false
      ui.setCanvasScope({ type: 'note', noteId })
      ui.setMode('canvas')
      return true
    },

    async createWorkspace(name = 'Untitled Workspace'): Promise<void> {
      const created = await failGuard(
        () => store.createWorkspace(name.trim() || 'Untitled Workspace'),
        'Could not create a workspace.\nPlease try again.',
      )
      if (created) {
        await store.selectNote(null)
        ui.setMode('note')
        ui.clearSelection()
      }
    },

    async renameWorkspace(id: string, name: string): Promise<void> {
      const trimmed = name.trim()
      if (!trimmed) return
      await failGuard(
        async () => {
          await store.renameWorkspace(id, trimmed)
          return true
        },
        'Could not rename this workspace.\nPlease try again.',
      )
    },

    async deleteWorkspace(id: string): Promise<void> {
      const current = store.workspaces.value.find((item) => item.id === id)
      const ok = await ui.confirm({
        title: 'Delete this workspace?',
        message: current
          ? `“${current.metadata.name}” and all of its notes, graph, and related data will be removed.`
          : 'This workspace and all of its data will be removed.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return

      const wasSelected = store.workspace.value?.id === id
      const remaining = store.workspaces.value.filter((item) => item.id !== id)

      await failGuard(
        async () => {
          await store.deleteWorkspace(id)
          return true
        },
        'Could not delete this workspace.\nPlease try again.',
      )

      if (wasSelected) {
        const next = remaining[0]
        if (next) {
          await store.selectWorkspace(next.id)
          const first = store.notes.value[0]
          if (first) await openNote(first.id)
          else {
            await store.selectNote(null)
            ui.setMode('note')
          }
        } else {
          ui.clearSelection()
          ui.setMode('note')
        }
      }
    },

    async createNote(): Promise<void> {
      const id = workspaceId()
      if (!id) return
      await createWorkspaceNote(id)
    },

    async renameNote(id: string, title: string): Promise<boolean> {
      const trimmed = title.trim()
      if (!trimmed) return false
      return !!await failGuard(
        () => store.renameNote(id, trimmed),
        'Could not rename this note.\nPlease try again.',
      )
    },

    async deleteNote(id: string): Promise<boolean> {
      const ok = await ui.confirm({
        title: 'Delete this note?',
        message: 'The note and its blocks will be removed. Related nodes stay, but lose this link.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return false
      const wasSelected = store.note.value?.id === id
      const previousWorkspaceId = store.workspace.value?.id
      const deleted = await failGuard(
        () => store.deleteNote(id),
        'Could not delete this note.\nPlease try again.',
      )
      if (!deleted) return false
      if (wasSelected && !store.note.value && store.workspace.value?.id === previousWorkspaceId) {
        ui.selectBlock(null)
        const next = store.notes.value[0]
        if (next) await store.selectNote(next.id)
      }
      return true
    },

    async moveWorkspace(id: string, targetId: string, after: boolean): Promise<boolean> {
      return !!await failGuard(() => store.moveWorkspace(id, targetId, after), '无法保存 Workspace 顺序，请重试。')
    },

    async moveWorkspaceNote(workspaceId: string, id: string, targetId: string, after: boolean): Promise<boolean> {
      return !!await failGuard(() => store.moveWorkspaceNote(workspaceId, id, targetId, after), '无法保存笔记顺序，请重试。')
    },

    async createBlock(type: BlockType): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      const id = createId('block')
      const result = await run({
        operation: 'create_block',
        workspace_id: ws,
        note_id: note,
        block: defaultBlockInput(id, type),
      })
      if (result.success) ui.selectBlock(id)
    },

    async updateBlock(blockId: string, changes: BlockChanges): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      await run({
        operation: 'update_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
        changes,
      })
    },

    async duplicateBlock(block: Block): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      const id = createId('block')
      await run({
        operation: 'create_block',
        workspace_id: ws,
        note_id: note,
        block: duplicateBlockInput(id, block),
        after_block_id: block.id,
      })
    },

    async deleteBlock(blockId: string): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      const ok = await ui.confirm({
        title: 'Delete this block?',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
      const result = await run({
        operation: 'delete_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
      })
      if (result.success && ui.selectedBlockId.value === blockId) {
        ui.selectBlock(null)
      }
    },

    async moveBlock(blockId: string, afterBlockId: string | null): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      await run({
        operation: 'move_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
        after_block_id: afterBlockId,
      })
    },

    async moveBlockByDirection(blockId: string, direction: 'up' | 'down'): Promise<void> {
      const index = store.blocks.value.findIndex((block) => block.id === blockId)
      const neighbor = store.blocks.value[index + (direction === 'up' ? -1 : 1)]
      if (index < 0 || !neighbor || !store.note.value) return
      await reorderBlock(blockId, { targetId: neighbor.id, after: direction === 'down' }, store.note.value.id)
    },

    async dropBlockBefore(draggedId: string, targetId: string): Promise<void> {
      if (store.note.value) await reorderBlock(draggedId, { targetId, after: false }, store.note.value.id)
    },

    async convertBlockToNode(block: Block): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws) return
      const result = await run({
        operation: 'create_node',
        workspace_id: ws,
        node: {
          id: createId('node'),
          label: blockTitle(block),
          type: nodeTypeFromBlock(block.type),
          ...(note ? { note_id: note } : {}),
          position: { x: 120 + Math.random() * 80, y: 120 + Math.random() * 80 },
        },
      })
      if (result.success) {
        ui.showToast('Created a knowledge node from this block.')
      }
    },

    askAiAboutBlock(block: Block, prompt: string): void {
      useAiEditor().askAboutBlock(block.id, prompt)
    },

    async createNode(
      label: string,
      type: GraphNodeType,
      position?: GraphNodePosition,
      options?: { id?: string; noteId?: string },
    ): Promise<string | null> {
      const ws = workspaceId()
      if (!ws) return null
      const id = options?.id ?? createId('node')
      const result = await run({
        operation: 'create_node',
        workspace_id: ws,
        node: {
          id,
          label: label.trim() || 'Untitled',
          type,
          ...(options?.noteId ? { note_id: options.noteId } : {}),
          position: position ?? { x: 160, y: 120 },
        },
      })
      if (result.success) ui.selectNode(id)
      return result.success ? id : null
    },

    async moveNode(nodeId: string, position: GraphNodePosition): Promise<boolean> {
      const ws = workspaceId()
      if (!ws) return false
      const result = await run({
        operation: 'move_node',
        workspace_id: ws,
        node_id: nodeId,
        position,
      })
      return result.success
    },

    async moveNodes(positions: { node_id: string; position: GraphNodePosition | null }[]): Promise<boolean> {
      const ws = workspaceId()
      if (!ws || !positions.length) return false
      const result = await run({ operation: 'move_nodes', workspace_id: ws, positions }, '暂时无法保存布局，请重试。')
      return result.success
    },

    async updateNode(
      nodeId: string,
      changes: { label?: string; type?: GraphNodeType; note_id?: string | null },
    ): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      await run({
        operation: 'update_node',
        workspace_id: ws,
        node_id: nodeId,
        changes,
      })
    },

    async deleteNode(nodeId: string): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      const ok = await ui.confirm({
        title: 'Delete this node?',
        message: 'Connected relationships will be removed automatically.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
      const result = await run({
        operation: 'delete_node',
        workspace_id: ws,
        node_id: nodeId,
      })
      if (result.success) ui.selectNode(null)
    },

    async createEdge(source: string, target: string, type: GraphEdgeType): Promise<void> {
      const ws = workspaceId()
      if (!ws || source === target) return
      await run({
        operation: 'create_edge',
        workspace_id: ws,
        edge: {
          id: createId('edge'),
          source,
          target,
          type,
        },
      })
    },

    async deleteEdge(edgeId: string): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      const result = await run({
        operation: 'delete_edge',
        workspace_id: ws,
        edge_id: edgeId,
      })
      if (result.success) ui.selectEdge(null)
    },

    sendAiPlaceholder(text: string): void {
      const trimmed = text.trim()
      if (!trimmed) return
      ui.pushAiMessage('user', trimmed)
      ui.pushAiMessage(
        'assistant',
        'AI connection is not configured yet.\nThis panel is the future exploration entrance — your question and the current context are ready for a model.',
      )
      ui.aiDraft.value = ''
    },
  }
}
