/**
 * Nexora Knowledge Data Layer — public surface.
 *
 * Vue code imports from here only. IndexedDB primitives (IDBRequest,
 * IDBTransaction, IDBObjectStore) never cross this boundary.
 */

export type {
  Block,
  BlockData,
  BlockDataByType,
  BlockDataPatch,
  BlockMetadata,
  BlockSource,
  BlockType,
  CodeBlockData,
  ConceptBlockData,
  ContentBlockData,
  ExampleBlockData,
  ExplorationBlockData,
  IntuitionBlockData,
  MathBlockData,
  TextBlockData,
  TypedBlock,
} from './models/block'
export {
  BLOCK_DATA_FIELDS,
  BLOCK_SOURCES,
  BLOCK_TYPES,
  isBlockSource,
  isBlockType,
} from './models/block'

export type { Note, NoteMetadata } from './models/note'
export type {
  Graph,
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphNodePosition,
  GraphNodeType,
} from './models/graph'
export {
  createEmptyGraph,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  isGraphEdgeType,
  isGraphNodeType,
} from './models/graph'
export type { Workspace, WorkspaceMetadata } from './models/workspace'
export type {
  Conversation,
  ConversationMessage,
  ConversationMetadata,
  ConversationRole,
} from './models/conversation'
export { CONVERSATION_ROLES, isConversationRole } from './models/conversation'
export type { Asset, AssetMetadata, AssetType } from './models/asset'
export { ASSET_TYPES, isAssetType } from './models/asset'

export { DB_NAME, DB_VERSION, INDEXES, STORES, STORE_DEFINITIONS } from './db/schema'
export type { StoreName } from './db/schema'
export { closeDatabase, DatabaseError, deleteDatabase, openDatabase } from './db/database'

export { createId } from './utils/id'
export { isIsoTimestamp, nowIso } from './utils/time'

export { validateBlock, ValidationError } from './validation'
export { ConflictError, NotFoundError } from './repositories/internal'

export { workspaceRepository } from './repositories/workspaceRepository'
export type { CreateWorkspaceInput } from './repositories/workspaceRepository'
export { noteRepository } from './repositories/noteRepository'
export type { CreateNoteInput } from './repositories/noteRepository'
export { blockRepository, createBlock } from './repositories/blockRepository'
export type { BlockAnchor, BlockPatch, CreateBlockOptions } from './repositories/blockRepository'
export { graphRepository } from './repositories/graphRepository'
export type {
  CreateGraphEdgeInput,
  CreateGraphNodeInput,
  UpdateGraphNodeInput,
} from './repositories/graphRepository'
export { conversationRepository, createMessage } from './repositories/conversationRepository'
export type { CreateConversationInput } from './repositories/conversationRepository'
export { assetRepository } from './repositories/assetRepository'
export type { CreateAssetInput } from './repositories/assetRepository'

export {
  base64ToBlob,
  blobToBase64,
  describeSnapshot,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  SnapshotError,
  snapshotFilename,
} from './transfer/snapshot'
export type {
  AssetSnapshot,
  BackupSnapshot,
  NoteSnapshot,
  Snapshot,
  SnapshotEnvelope,
  SnapshotErrorCode,
  SnapshotSummary,
  WorkspaceBundle,
  WorkspaceSnapshot,
} from './transfer/snapshot'
export { parseSnapshot } from './transfer/validate'
export {
  exportBackupSnapshot,
  exportNoteSnapshot,
  exportWorkspaceSnapshot,
  readSnapshotBlob,
  snapshotToBlob,
  snapshotToJson,
} from './transfer/exporter'
export { importSnapshot } from './transfer/importer'
export type { ImportMode, ImportOptions, ImportSummary } from './transfer/importer'
