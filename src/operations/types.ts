/**
 * The Operation protocol — Nexora's only sanctioned way to change knowledge
 * data. Field names are snake_case because this is a wire format: the next
 * stage feeds it straight from an LLM's structured output. The engine maps it
 * onto the camelCase domain models.
 */

import type {
  BlockDataByType,
  BlockDataPatch,
  BlockSource,
  BlockType,
  GraphEdgeType,
  GraphNodePosition,
  GraphNodeType,
} from '../data'
import type { OperationErrorCode } from './errors'

export const OPERATION_TYPES = [
  'create_block',
  'delete_block',
  'update_block',
  'replace_block',
  'move_block',
  'create_node',
  'delete_node',
  'update_node',
  'move_node',
  'move_nodes',
  'create_edge',
  'delete_edge',
] as const

export type OperationType = (typeof OPERATION_TYPES)[number]

export function isOperationType(value: unknown): value is OperationType {
  return typeof value === 'string' && (OPERATION_TYPES as readonly string[]).includes(value)
}

/**
 * Anchor for block ordering: a block id places the block right after that
 * sibling, `null` places it first. `create_block` may omit it to append.
 */
export type BlockAnchorId = string | null

/** The metadata an operation owns. Timestamps belong to the data layer. */
export interface BlockMetadataInput {
  source?: BlockSource
  tags?: string[]
}

/** Mirrors `Block`, minus the timestamps the engine fills in. */
export type BlockInput = {
  [T in BlockType]: {
    id: string
    type: T
    data: BlockDataByType[T]
    metadata?: BlockMetadataInput
  }
}[BlockType]

/**
 * `update_block` patches fields, never whole objects, and `id` / `type` are
 * deliberately unreachable from here — changing either needs its own
 * operation.
 */
export interface BlockChanges {
  data?: BlockDataPatch
  metadata?: BlockMetadataInput
}

export interface CreateBlockOperation {
  operation: 'create_block'
  workspace_id: string
  note_id: string
  block: BlockInput
  /** Omit to append to the end of the note. */
  after_block_id?: BlockAnchorId
}

export interface DeleteBlockOperation {
  operation: 'delete_block'
  workspace_id: string
  note_id: string
  block_id: string
}

export interface UpdateBlockOperation {
  operation: 'update_block'
  workspace_id: string
  note_id: string
  block_id: string
  changes: BlockChanges
}

export interface MoveBlockOperation {
  operation: 'move_block'
  workspace_id: string
  note_id: string
  block_id: string
  after_block_id: BlockAnchorId
}

/**
 * Replaces a block in place, including `type`. Identity (`id`) stays; timestamps
 * are owned by the data layer. Used when an edit converts e.g. text → concept.
 */
export interface ReplaceBlockOperation {
  operation: 'replace_block'
  workspace_id: string
  note_id: string
  block_id: string
  block: BlockInput
}

/** Mirrors `GraphNode`; `workspace_id` lives on the operation itself. */
export interface NodeInput {
  id: string
  label: string
  type: GraphNodeType
  note_id?: string
  position?: GraphNodePosition
  metadata?: Record<string, unknown>
}

/** `position` is owned by the move operations, so it is absent here. */
export interface NodeChanges {
  label?: string
  type?: GraphNodeType
  /** `null` detaches the node from its note. */
  note_id?: string | null
  metadata?: Record<string, unknown>
}

export interface EdgeInput {
  id: string
  source: string
  target: string
  type: GraphEdgeType
  metadata?: Record<string, unknown>
}

export interface CreateNodeOperation {
  operation: 'create_node'
  workspace_id: string
  node: NodeInput
}

export interface DeleteNodeOperation {
  operation: 'delete_node'
  workspace_id: string
  node_id: string
}

export interface UpdateNodeOperation {
  operation: 'update_node'
  workspace_id: string
  node_id: string
  changes: NodeChanges
}

export interface MoveNodeOperation {
  operation: 'move_node'
  workspace_id: string
  node_id: string
  position: GraphNodePosition
}

/** One atomic layout change; null restores a node's unplaced state. */
export interface MoveNodesOperation {
  operation: 'move_nodes'
  workspace_id: string
  positions: { node_id: string; position: GraphNodePosition | null }[]
}

export interface CreateEdgeOperation {
  operation: 'create_edge'
  workspace_id: string
  edge: EdgeInput
}

export interface DeleteEdgeOperation {
  operation: 'delete_edge'
  workspace_id: string
  edge_id: string
}

export type BlockOperation =
  | CreateBlockOperation
  | DeleteBlockOperation
  | UpdateBlockOperation
  | ReplaceBlockOperation
  | MoveBlockOperation

export type GraphOperation =
  | CreateNodeOperation
  | DeleteNodeOperation
  | UpdateNodeOperation
  | MoveNodeOperation
  | MoveNodesOperation
  | CreateEdgeOperation
  | DeleteEdgeOperation

export type Operation = BlockOperation | GraphOperation

export interface OperationResult {
  success: boolean
  operation: Operation
  /** Every id the operation touched, cascades included. Empty on failure. */
  affectedIds: string[]
  error?: {
    code: OperationErrorCode
    message: string
  }
}
