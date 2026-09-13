import { runTransaction } from '../db/database'
import { INDEXES, STORES } from '../db/schema'
import type { Block } from '../models/block'
import type { Note } from '../models/note'
import type { Workspace } from '../models/workspace'
import { createId } from '../utils/id'
import { nowIso } from '../utils/time'
import { validateNote } from '../validation'
import { ConflictError, loadWorkspace, NotFoundError, saveWorkspace, withId, withoutId } from './internal'

export interface CreateNoteInput {
  workspaceId: string
  title: string
  blocks?: Block[]
}

export function buildNote(input: CreateNoteInput): Note {
  const timestamp = nowIso()
  return {
    id: createId('note'),
    workspaceId: input.workspaceId,
    title: input.title,
    blocks: input.blocks ?? [],
    metadata: { createdAt: timestamp, updatedAt: timestamp },
  }
}

export const noteRepository = {
  async createNote(input: CreateNoteInput): Promise<Note> {
    return noteRepository.create(buildNote(input))
  },

  async create(note: Note): Promise<Note> {
    validateNote(note)
    return runTransaction([STORES.workspaces, STORES.notes], 'readwrite', async (ctx) => {
      const notes = ctx.store<Note>(STORES.notes)
      if (await notes.get(note.id)) {
        throw new ConflictError(`Note already exists: ${note.id}`)
      }

      const workspace = await loadWorkspace(ctx, note.workspaceId)
      await notes.add(note)
      await saveWorkspace(ctx, { ...workspace, noteIds: withId(workspace.noteIds, note.id) })
      return note
    })
  },

  getById(id: string): Promise<Note | undefined> {
    return runTransaction(STORES.notes, 'readonly', (ctx) => ctx.store<Note>(STORES.notes).get(id))
  },

  getByWorkspaceId(workspaceId: string): Promise<Note[]> {
    return runTransaction(STORES.notes, 'readonly', (ctx) =>
      ctx.store<Note>(STORES.notes).getAllByIndex(INDEXES.byWorkspaceId, workspaceId),
    )
  },

  /** Read and rename atomically so typing in a block cannot be overwritten by a stale note. */
  async rename(id: string, title: string): Promise<Note> {
    return runTransaction(STORES.notes, 'readwrite', async (ctx) => {
      const notes = ctx.store<Note>(STORES.notes)
      const current = await notes.get(id)
      if (!current) throw new NotFoundError(`Note not found: ${id}`)
      const updated = { ...current, title, metadata: { ...current.metadata, updatedAt: nowIso() } }
      validateNote(updated)
      await notes.put(updated)
      return updated
    })
  },

  async update(note: Note): Promise<Note> {
    validateNote(note)
    return runTransaction(STORES.notes, 'readwrite', async (ctx) => {
      const notes = ctx.store<Note>(STORES.notes)
      const existing = await notes.get(note.id)
      if (!existing) {
        throw new NotFoundError(`Note not found: ${note.id}`)
      }
      if (existing.workspaceId !== note.workspaceId) {
        throw new ConflictError('Moving a note between workspaces is not supported')
      }

      const updated: Note = {
        ...note,
        metadata: {
          createdAt: existing.metadata.createdAt,
          updatedAt: nowIso(),
        },
      }
      await notes.put(updated)
      return updated
    })
  },

  /** Also drops the workspace reference and detaches graph nodes pointing here. */
  async delete(id: string): Promise<void> {
    await runTransaction([STORES.workspaces, STORES.notes], 'readwrite', async (ctx) => {
      const notes = ctx.store<Note>(STORES.notes)
      const note = await notes.get(id)
      if (!note) {
        throw new NotFoundError(`Note not found: ${id}`)
      }

      await notes.delete(id)

      const workspace = await ctx.store<Workspace>(STORES.workspaces).get(note.workspaceId)
      if (!workspace) {
        return
      }

      await saveWorkspace(ctx, {
        ...workspace,
        noteIds: withoutId(workspace.noteIds, id),
        graph: {
          ...workspace.graph,
          nodes: workspace.graph.nodes.map((node) => {
            if (node.noteId !== id) {
              return node
            }
            const { noteId: _removed, ...rest } = node
            return rest
          }),
        },
      })
    })
  },
}
