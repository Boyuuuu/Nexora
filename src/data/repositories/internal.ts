import type { TransactionContext } from '../db/database'
import { STORES } from '../db/schema'
import type { Workspace } from '../models/workspace'
import { nowIso } from '../utils/time'

export class NotFoundError extends Error {
  override name = 'NotFoundError'
}

export class ConflictError extends Error {
  override name = 'ConflictError'
}

export async function loadWorkspace(ctx: TransactionContext, id: string): Promise<Workspace> {
  const workspace = await ctx.store<Workspace>(STORES.workspaces).get(id)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${id}`)
  }
  return workspace
}

/** Persists a workspace and refreshes its `updatedAt` stamp. */
export async function saveWorkspace(
  ctx: TransactionContext,
  workspace: Workspace,
): Promise<Workspace> {
  const touched: Workspace = {
    ...workspace,
    metadata: { ...workspace.metadata, updatedAt: nowIso() },
  }
  await ctx.store<Workspace>(STORES.workspaces).put(touched)
  return touched
}

export function withId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

export function withoutId(ids: string[], id: string): string[] {
  return ids.filter((value) => value !== id)
}
