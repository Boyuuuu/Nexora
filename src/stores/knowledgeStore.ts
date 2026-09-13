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
  noteRepository,
  workspaceRepository,
  type Graph,
  type Note,
  type Workspace,
} from '../data'
import { executeOperation, type Operation, type OperationResult } from '../operations'

const workspaces = ref<Workspace[]>([])
const workspace = ref<Workspace | null>(null)
const notes = ref<Note[]>([])
const note = ref<Note | null>(null)
const busy = ref(false)
const lastError = ref<string | null>(null)

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

    clearError(): void {
      lastError.value = null
    },

    async loadWorkspaces(): Promise<void> {
      await guard(async () => {
        workspaces.value = await workspaceRepository.getAll()
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

    async renameNote(noteId: string, title: string): Promise<void> {
      await guard(async () => {
        const current = await noteRepository.getById(noteId)
        if (!current) {
          throw new Error(`Note not found: ${noteId}`)
        }
        const updated = await noteRepository.update({ ...current, title })
        note.value = updated
        await readWorkspace(updated.workspaceId)
      })
    },

    async deleteNote(noteId: string): Promise<void> {
      await guard(async () => {
        const current = await noteRepository.getById(noteId)
        await noteRepository.delete(noteId)
        if (note.value?.id === noteId) {
          note.value = null
        }
        if (current) {
          await readWorkspace(current.workspaceId)
        }
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
