import { runTransaction } from '../db/database'
import { STORES } from '../db/schema'
import type { Asset } from '../models/asset'
import type { Conversation } from '../models/conversation'
import { createEmptyGraph } from '../models/graph'
import type { Note } from '../models/note'
import type { Workspace } from '../models/workspace'
import { createId } from '../utils/id'
import { nowIso } from '../utils/time'
import { moveRelative } from '../utils/reorder'
import { validateWorkspace } from '../validation'
import { ConflictError, loadWorkspace, NotFoundError, saveWorkspace } from './internal'

function bySidebarOrder(a: Workspace, b: Workspace): number {
  return (a.sidebarOrder ?? Number.MAX_SAFE_INTEGER) - (b.sidebarOrder ?? Number.MAX_SAFE_INTEGER)
}

export interface CreateWorkspaceInput {
  name: string
  description?: string
}

function buildWorkspace(input: CreateWorkspaceInput): Workspace {
  const timestamp = nowIso()
  return {
    id: createId('ws'),
    metadata: {
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    noteIds: [],
    graph: createEmptyGraph(),
    conversationIds: [],
    assetIds: [],
  }
}

export const workspaceRepository = {
  /** Builds an empty workspace and persists it. */
  async createWorkspace(name: string, description?: string): Promise<Workspace> {
    const input: CreateWorkspaceInput =
      description === undefined ? { name } : { name, description }
    return workspaceRepository.create(buildWorkspace(input))
  },

  async create(workspace: Workspace): Promise<Workspace> {
    validateWorkspace(workspace)
    return runTransaction(STORES.workspaces, 'readwrite', async (ctx) => {
      const store = ctx.store<Workspace>(STORES.workspaces)
      if (await store.get(workspace.id)) {
        throw new ConflictError(`Workspace already exists: ${workspace.id}`)
      }
      await store.add(workspace)
      return workspace
    })
  },

  getById(id: string): Promise<Workspace | undefined> {
    return runTransaction(STORES.workspaces, 'readonly', (ctx) =>
      ctx.store<Workspace>(STORES.workspaces).get(id),
    )
  },

  getAll(): Promise<Workspace[]> {
    return runTransaction(STORES.workspaces, 'readonly', async (ctx) =>
      (await ctx.store<Workspace>(STORES.workspaces).getAll()).sort(bySidebarOrder),
    )
  },

  /** Resolve relative placement against fresh records in a single transaction. */
  async move(id: string, targetId: string, after: boolean): Promise<Workspace[]> {
    return runTransaction(STORES.workspaces, 'readwrite', async (ctx) => {
      const store = ctx.store<Workspace>(STORES.workspaces)
      const current = (await store.getAll()).sort(bySidebarOrder)
      const ids = moveRelative(current.map((item) => item.id), id, targetId, after)
      const byId = new Map(current.map((item) => [item.id, item]))
      const ordered = ids.map((itemId, sidebarOrder) => ({ ...byId.get(itemId)!, sidebarOrder }))
      for (const item of ordered) await store.put(item)
      return ordered
    })
  },

  async moveNote(workspaceId: string, noteId: string, targetId: string, after: boolean): Promise<Workspace> {
    return runTransaction(STORES.workspaces, 'readwrite', async (ctx) => {
      const current = await loadWorkspace(ctx, workspaceId)
      return saveWorkspace(ctx, {
        ...current,
        noteIds: moveRelative(current.noteIds, noteId, targetId, after),
      })
    })
  },

  async update(workspace: Workspace): Promise<Workspace> {
    validateWorkspace(workspace)
    return runTransaction(STORES.workspaces, 'readwrite', async (ctx) => {
      const store = ctx.store<Workspace>(STORES.workspaces)
      const existing = await store.get(workspace.id)
      if (!existing) {
        throw new NotFoundError(`Workspace not found: ${workspace.id}`)
      }
      const updated: Workspace = {
        ...workspace,
        metadata: {
          ...workspace.metadata,
          createdAt: existing.metadata.createdAt,
          updatedAt: nowIso(),
        },
      }
      await store.put(updated)
      return updated
    })
  },

  /** Cascade delete: removes the workspace together with all of its children. */
  async delete(id: string): Promise<void> {
    await runTransaction(
      [STORES.workspaces, STORES.notes, STORES.conversations, STORES.assets],
      'readwrite',
      async (ctx) => {
        const workspaces = ctx.store<Workspace>(STORES.workspaces)
        if (!(await workspaces.get(id))) {
          throw new NotFoundError(`Workspace not found: ${id}`)
        }

        const notes = ctx.store<Note>(STORES.notes)
        for (const note of await notes.getAllByIndex('byWorkspaceId', id)) {
          await notes.delete(note.id)
        }

        const conversations = ctx.store<Conversation>(STORES.conversations)
        for (const conversation of await conversations.getAllByIndex('byWorkspaceId', id)) {
          await conversations.delete(conversation.id)
        }

        const assets = ctx.store<Asset>(STORES.assets)
        for (const asset of await assets.getAllByIndex('byWorkspaceId', id)) {
          await assets.delete(asset.id)
        }

        await workspaces.delete(id)
      },
    )
  },
}
