import { hasPendingNoteDrafts } from '../workspace/noteDrafts'
/**
 * The UI's only view of knowledge data.
 *
 *   components → knowledgeStore → Operation Engine → Repository → IndexedDB
 *                             ↘ (reads) Repository ↗
 *
 * Components never import a repository or the engine themselves. Writes go out
 * as Operations; every successful Operation re-reads the scope it touched, so
 * what is on screen is what is in IndexedDB rather than an optimistic guess.
 *
 * Creating and deleting Workspaces and Notes still goes straight to the
 * repositories: the Operation protocol covers Block and Graph edits only, so
 * those calls are gathered here instead of being spread across views.
 */

import { computed, ref } from 'vue'
import {
  createEmptyGraph,
  conversationRepository,
  type Conversation,
  type ConversationRole,
  noteRepository,
  workspaceRepository,
  type Graph,
  type Note,
  type Workspace,
} from '../data'
import { executeOperation, executeBlockBatch, type BlockOperation, type Operation, type OperationResult } from '../operations'

const workspaces = ref<Workspace[]>([])
const workspace = ref<Workspace | null>(null)
const notes = ref<Note[]>([])
const note = ref<Note | null>(null)
const busy = ref(false)
const lastError = ref<string | null>(null)

export type WorkspaceNoteSummary = Pick<Note, 'id' | 'title' | 'workspaceId'>

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Wraps repository calls so a failure surfaces in `lastError` instead of escaping. */
async function guard<T>(work: () => Promise<T>): Promise<T | null> {
  busy.value = true
  lastError.value = null
  try {
    return await work()
  } catch (error) {
    lastError.value = describe(error)
    return null
  } finally {
    busy.value = false
  }
}

async function readWorkspace(workspaceId: string): Promise<void> {
  const stored = await workspaceRepository.getById(workspaceId)
  if (stored) updateWorkspaceEntry(stored)
  workspace.value = stored ?? null
  if (!stored) {
    notes.value = []
    note.value = null
    return
  }
  const loaded = await noteRepository.getByWorkspaceId(workspaceId)
  // Present notes in the workspace's own order rather than the index's.
  notes.value = stored.noteIds
    .map((id) => loaded.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Note => candidate !== undefined)
}

function updateWorkspaceEntry(updated: Workspace): void {
  workspaces.value = workspaces.value.map((item) => item.id === updated.id ? updated : item)
}

/** Refresh a changed branch without navigating away from the current editor. */
async function refreshBranch(workspaceId: string): Promise<void> {
  const stored = await workspaceRepository.getById(workspaceId)
  if (!stored) return
  updateWorkspaceEntry(stored)
  const loaded = await noteRepository.getByWorkspaceId(workspaceId)
  if (workspace.value?.id !== workspaceId) return
  workspace.value = stored
  const byId = new Map(loaded.map((item) => [item.id, item]))
  notes.value = stored.noteIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])
}

async function readNote(noteId: string): Promise<void> {
  note.value = (await noteRepository.getById(noteId)) ?? null
}

/** Re-reads whatever the operation could have changed. */
async function refreshAfter(operation: Operation): Promise<void> {
  if ('note_id' in operation) {
    await readNote(operation.note_id)
  }
  await readWorkspace(operation.workspace_id)
}

export function useKnowledgeStore() {
  return {
    workspaces: computed(() => workspaces.value),
    workspace: computed(() => workspace.value),
    notes: computed(() => notes.value),
    note: computed(() => note.value),
    graph: computed<Graph>(() => workspace.value?.graph ?? createEmptyGraph()),
    blocks: computed(() => note.value?.blocks ?? []),
    busy: computed(() => busy.value),
    lastError: computed(() => lastError.value),

    async refreshNoteForAi(expected: Note): Promise<Note> {
      const latest = await noteRepository.getById(expected.id)
      if (!latest) throw new Error('这篇笔记已删除，无法继续整理。')
      if (hasPendingNoteDrafts(latest) || hasPendingNoteDrafts(expected)) throw new Error('笔记正在编辑，请保存后重试。')
      // Refresh the original screen only if it has not changed while reading storage.
      if (note.value?.id === expected.id && JSON.stringify(note.value) === JSON.stringify(expected)) note.value = latest
      notes.value = notes.value.map((item) => item.id === latest.id ? latest : item)
      return latest
    },

    async runBlockBatch(expected: Note, operations: BlockOperation[]): Promise<Note> {
      const updated = await executeBlockBatch(expected, operations)
      // Background work must never navigate to its original note/workspace.
      if (note.value?.id === updated.id) note.value = updated
      notes.value = notes.value.map((item) => item.id === updated.id ? updated : item)
      return updated
    },

    async findNoteConversation(target: Note): Promise<Conversation | undefined> {
      const conversations = await conversationRepository.getByWorkspaceId(target.workspaceId)
      return conversations.find((item) => item.noteId === target.id)
    },
    async createNoteConversation(target: Note): Promise<Conversation> {
      return conversationRepository.createConversation({ workspaceId: target.workspaceId, noteId: target.id, title: target.title })
    },
    appendChatMessage(id: string, role: ConversationRole, content: string): Promise<Conversation> {
      return conversationRepository.appendMessage(id, role, content)
    },

    clearError(): void {
      lastError.value = null
    },

    async loadWorkspaces(): Promise<void> {
      await guard(async () => {
        workspaces.value = await workspaceRepository.getAll()
      })
    },

    /** Read a tree branch without changing the active workspace, note, or editor state. */
    async listWorkspaceNotes(workspaceId: string): Promise<WorkspaceNoteSummary[]> {
      const stored = await workspaceRepository.getById(workspaceId)
      if (!stored) return []
      const loaded = await noteRepository.getByWorkspaceId(workspaceId)
      const byId = new Map(loaded.map((item) => [item.id, item]))
      return stored.noteIds.flatMap((id) => {
        const item = byId.get(id)
        return item ? [{ id: item.id, title: item.title, workspaceId: item.workspaceId }] : []
      })
    },

    async selectWorkspace(workspaceId: string | null): Promise<void> {
      if (workspaceId === null) {
        workspace.value = null
        notes.value = []
        note.value = null
        return
      }
      await guard(async () => {
        await readWorkspace(workspaceId)
        // A note from the previous workspace must not stay on screen.
        if (note.value && note.value.workspaceId !== workspaceId) {
          note.value = null
        }
      })
    },

    async selectNote(noteId: string | null): Promise<void> {
      if (noteId === null) {
        note.value = null
        return
      }
      await guard(() => readNote(noteId))
    },

    /** Re-reads everything currently on screen; used after an import. */
    async reload(): Promise<void> {
      await guard(async () => {
        workspaces.value = await workspaceRepository.getAll()
        const workspaceId = workspace.value?.id
        const noteId = note.value?.id
        if (workspaceId) {
          await readWorkspace(workspaceId)
        }
        if (noteId) {
          await readNote(noteId)
        }
      })
    },

    /**
     * The single write path for knowledge edits. Returns the engine's result so
     * the caller can react to a specific error code; `lastError` carries the
     * message for anything that just wants to show it.
     */
    async run(operation: Operation): Promise<OperationResult> {
      busy.value = true
      lastError.value = null
      try {
        const result = await executeOperation(operation)
        if (result.success) {
          await refreshAfter(operation)
        } else {
          lastError.value = `${result.error?.code}: ${result.error?.message}`
        }
        return result
      } finally {
        busy.value = false
      }
    },

    // ----- Workspace / Note lifecycle: repository calls, not Operations -----

    async createWorkspace(name: string, description?: string): Promise<Workspace | null> {
      return guard(async () => {
        const created = await workspaceRepository.createWorkspace(name, description)
        workspaces.value = await workspaceRepository.getAll()
        await readWorkspace(created.id)
        return created
      })
    },

    async renameWorkspace(workspaceId: string, name: string): Promise<Workspace | null> {
      return guard(async () => {
        const trimmed = name.trim()
        if (!trimmed) {
          throw new Error('Workspace name cannot be empty')
        }
        const current = await workspaceRepository.getById(workspaceId)
        if (!current) {
          throw new Error(`Workspace not found: ${workspaceId}`)
        }
        const updated = await workspaceRepository.update({
          ...current,
          metadata: { ...current.metadata, name: trimmed },
        })
        workspaces.value = await workspaceRepository.getAll()
        if (workspace.value?.id === workspaceId) {
          workspace.value = updated
        }
        return updated
      })
    },

    async deleteWorkspace(workspaceId: string): Promise<void> {
      await guard(async () => {
        await workspaceRepository.delete(workspaceId)
        workspaces.value = await workspaceRepository.getAll()
        if (workspace.value?.id === workspaceId) {
          workspace.value = null
          notes.value = []
          note.value = null
        }
      })
    },

    async createNote(workspaceId: string, title: string): Promise<Note | null> {
      return guard(async () => {
        const created = await noteRepository.createNote({ workspaceId, title })
        await readWorkspace(workspaceId)
        note.value = created
        return created
      })
    },

    async renameNote(noteId: string, title: string): Promise<Note | null> {
      return guard(async () => {
        const updated = await noteRepository.rename(noteId, title.trim())
        if (note.value?.id === noteId) note.value = updated
        await refreshBranch(updated.workspaceId)
        return updated
      })
    },

    async deleteNote(noteId: string): Promise<boolean | null> {
      return guard(async () => {
        const current = await noteRepository.getById(noteId)
        await noteRepository.delete(noteId)
        if (note.value?.id === noteId) {
          note.value = null
        }
        if (current) {
          await refreshBranch(current.workspaceId)
        }
        return true
      })
    },

    async moveWorkspace(id: string, targetId: string, after: boolean): Promise<boolean | null> {
      return guard(async () => {
        workspaces.value = await workspaceRepository.move(id, targetId, after)
        if (workspace.value) {
          workspace.value = workspaces.value.find((item) => item.id === workspace.value?.id) ?? workspace.value
        }
        return true
      })
    },

    async moveWorkspaceNote(workspaceId: string, id: string, targetId: string, after: boolean): Promise<boolean | null> {
      return guard(async () => {
        await workspaceRepository.moveNote(workspaceId, id, targetId, after)
        await refreshBranch(workspaceId)
        return true
      })
    },
  }
}

/** Test helper: drops in-memory selections without touching IndexedDB. */
export function resetKnowledgeStore(): void {
  workspaces.value = []
  workspace.value = null
  notes.value = []
  note.value = null
  busy.value = false
  lastError.value = null
}
