import type { Graph } from './graph'

export interface WorkspaceMetadata {
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

/**
 * Top-level knowledge space. Notes, conversations and assets live in their own
 * object stores and are referenced by id; only the graph is embedded.
 */
export interface Workspace {
  id: string
  metadata: WorkspaceMetadata
  noteIds: string[]
  graph: Graph
  conversationIds: string[]
  assetIds: string[]
}
