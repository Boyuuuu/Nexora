export const DB_NAME = 'nexora-db'
export const DB_VERSION = 1

export const STORES = {
  workspaces: 'workspaces',
  notes: 'notes',
  conversations: 'conversations',
  assets: 'assets',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

export const INDEXES = {
  byWorkspaceId: 'byWorkspaceId',
} as const

export interface IndexDefinition {
  name: string
  keyPath: string
  unique: boolean
}

export interface StoreDefinition {
  name: StoreName
  keyPath: string
  indexes: IndexDefinition[]
}

const byWorkspaceId: IndexDefinition = {
  name: INDEXES.byWorkspaceId,
  keyPath: 'workspaceId',
  unique: false,
}

/**
 * Graph nodes and edges intentionally have no store of their own in v1; they
 * are embedded in the owning Workspace record.
 */
export const STORE_DEFINITIONS: readonly StoreDefinition[] = [
  { name: STORES.workspaces, keyPath: 'id', indexes: [] },
  { name: STORES.notes, keyPath: 'id', indexes: [byWorkspaceId] },
  { name: STORES.conversations, keyPath: 'id', indexes: [byWorkspaceId] },
  { name: STORES.assets, keyPath: 'id', indexes: [byWorkspaceId] },
]
