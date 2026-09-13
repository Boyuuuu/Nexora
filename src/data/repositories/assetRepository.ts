import { runTransaction } from '../db/database'
import { INDEXES, STORES } from '../db/schema'
import type { Asset, AssetType } from '../models/asset'
import type { Workspace } from '../models/workspace'
import { createId } from '../utils/id'
import { nowIso } from '../utils/time'
import { validateAsset } from '../validation'
import {
  ConflictError,
  loadWorkspace,
  NotFoundError,
  saveWorkspace,
  withId,
  withoutId,
} from './internal'

export interface CreateAssetInput {
  workspaceId: string
  name: string
  type: AssetType
  data: Blob
  /** Defaults to the Blob's own MIME type. */
  mimeType?: string
}

export function buildAsset(input: CreateAssetInput): Asset {
  const timestamp = nowIso()
  return {
    id: createId('asset'),
    workspaceId: input.workspaceId,
    name: input.name,
    type: input.type,
    mimeType: input.mimeType ?? input.data.type,
    size: input.data.size,
    data: input.data,
    metadata: { createdAt: timestamp, updatedAt: timestamp },
  }
}

export const assetRepository = {
  createAsset(input: CreateAssetInput): Promise<Asset> {
    return assetRepository.create(buildAsset(input))
  },

  async create(asset: Asset): Promise<Asset> {
    validateAsset(asset)
    return runTransaction([STORES.workspaces, STORES.assets], 'readwrite', async (ctx) => {
      const assets = ctx.store<Asset>(STORES.assets)
      if (await assets.get(asset.id)) {
        throw new ConflictError(`Asset already exists: ${asset.id}`)
      }

      const workspace = await loadWorkspace(ctx, asset.workspaceId)
      await assets.add(asset)
      await saveWorkspace(ctx, { ...workspace, assetIds: withId(workspace.assetIds, asset.id) })
      return asset
    })
  },

  getById(id: string): Promise<Asset | undefined> {
    return runTransaction(STORES.assets, 'readonly', (ctx) =>
      ctx.store<Asset>(STORES.assets).get(id),
    )
  },

  getByWorkspaceId(workspaceId: string): Promise<Asset[]> {
    return runTransaction(STORES.assets, 'readonly', (ctx) =>
      ctx.store<Asset>(STORES.assets).getAllByIndex(INDEXES.byWorkspaceId, workspaceId),
    )
  },

  async update(asset: Asset): Promise<Asset> {
    validateAsset(asset)
    return runTransaction(STORES.assets, 'readwrite', async (ctx) => {
      const assets = ctx.store<Asset>(STORES.assets)
      const existing = await assets.get(asset.id)
      if (!existing) {
        throw new NotFoundError(`Asset not found: ${asset.id}`)
      }
      if (existing.workspaceId !== asset.workspaceId) {
        throw new ConflictError('Moving an asset between workspaces is not supported')
      }

      const updated: Asset = {
        ...asset,
        metadata: { createdAt: existing.metadata.createdAt, updatedAt: nowIso() },
      }
      await assets.put(updated)
      return updated
    })
  },

  async delete(id: string): Promise<void> {
    await runTransaction([STORES.workspaces, STORES.assets], 'readwrite', async (ctx) => {
      const assets = ctx.store<Asset>(STORES.assets)
      const asset = await assets.get(id)
      if (!asset) {
        throw new NotFoundError(`Asset not found: ${id}`)
      }

      await assets.delete(id)

      const workspace = await ctx.store<Workspace>(STORES.workspaces).get(asset.workspaceId)
      if (workspace) {
        await saveWorkspace(ctx, { ...workspace, assetIds: withoutId(workspace.assetIds, id) })
      }
    })
  },
}
