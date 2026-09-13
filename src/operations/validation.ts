/**
 * Pre-flight checks for every operation. They run before the engine calls a
 * repository, so a rejected operation never reaches IndexedDB, and they are
 * the only place operation error codes are chosen. The repositories re-check
 * their own invariants inside the write transaction — that is what actually
 * makes a write atomic; these checks exist to fail early and precisely.
 */

import {
  BLOCK_DATA_FIELDS,
  isBlockType,
  isGraphEdgeType,
  isGraphNodeType,
  noteRepository,
  validateBlock,
  ValidationError,
  workspaceRepository,
  type Block,
  type BlockType,
  type Graph,
  type GraphEdge,
  type GraphEdgeType,
  type GraphNode,
  type GraphNodePosition,
  type GraphNodeType,
  type Note,
  type Workspace,
} from '../data'
import { fail } from './errors'
import type { BlockAnchorId, Operation } from './types'

export function requireId(operation: Operation, value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_OPERATION', `${field} must be a non-empty string`, operation)
  }
  return value
}

export function requireObject(
  operation: Operation,
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_OPERATION', `${field} must be an object`, operation)
  }
  return value as Record<string, unknown>
}

/**
 * Validates a `changes` map against the fields the operation may touch.
 * `forbidden` is listed separately from merely unknown keys so that an attempt
 * to rewrite an identity field gets a message saying so.
 */
export function requireChanges(
  operation: Operation,
  changes: unknown,
  allowed: readonly string[],
  forbidden: readonly string[],
): Record<string, unknown> {
  const record = requireObject(operation, changes, 'changes')
  const keys = Object.keys(record)

  if (keys.length === 0) {
    fail('INVALID_OPERATION', 'changes must name at least one field', operation)
  }

  const blocked = keys.filter((key) => forbidden.includes(key))
  if (blocked.length > 0) {
    fail('INVALID_OPERATION', `changes cannot modify: ${blocked.join(', ')}`, operation)
  }

  const unsupported = keys.filter((key) => !allowed.includes(key))
  if (unsupported.length > 0) {
    fail('INVALID_OPERATION', `changes does not support: ${unsupported.join(', ')}`, operation)
  }

  return record
}

export async function requireWorkspace(
  operation: Operation,
  workspaceId: string,
): Promise<Workspace> {
  const workspace = await workspaceRepository.getById(workspaceId)
  if (!workspace) {
    fail('PARENT_NOT_FOUND', `Workspace not found: ${workspaceId}`, operation)
  }
  return workspace
}

export async function requireNote(
  operation: Operation,
  workspaceId: string,
  noteId: string,
): Promise<Note> {
  const note = await noteRepository.getById(noteId)
  if (!note) {
    fail('PARENT_NOT_FOUND', `Note not found: ${noteId}`, operation)
  }
  if (note.workspaceId !== workspaceId) {
    fail(
      'INVALID_REFERENCE',
      `Note ${noteId} belongs to workspace ${note.workspaceId}, not ${workspaceId}`,
      operation,
    )
  }
  return note
}

/** Used for `note_id` on graph nodes, where the note is a reference, not a parent. */
export async function requireNoteReference(
  operation: Operation,
  workspaceId: string,
  noteId: string,
): Promise<Note> {
  const note = await noteRepository.getById(noteId)
  if (!note) {
    fail('INVALID_REFERENCE', `note_id references unknown note: ${noteId}`, operation)
  }
  if (note.workspaceId !== workspaceId) {
    fail('INVALID_REFERENCE', `note_id belongs to another workspace: ${noteId}`, operation)
  }
  return note
}

export function requireBlock(operation: Operation, note: Note, blockId: string): Block {
  const block = note.blocks.find((candidate) => candidate.id === blockId)
  if (!block) {
    fail('TARGET_NOT_FOUND', `Block not found: ${blockId}`, operation)
  }
  return block
}

export function requireUnusedBlockId(operation: Operation, note: Note, blockId: string): void {
  if (note.blocks.some((block) => block.id === blockId)) {
    fail('DUPLICATE_ID', `Block already exists in note ${note.id}: ${blockId}`, operation)
  }
}

export function requireBlockType(operation: Operation, value: unknown): BlockType {
  if (!isBlockType(value)) {
    fail('INVALID_BLOCK_TYPE', `Unsupported block type: ${String(value)}`, operation)
  }
  return value
}

/**
 * Rejects `data` fields the target block type does not define. This is also
 * what keeps `id` and `type` unreachable from `update_block.changes.data`.
 */
export function requireKnownDataFields(
  operation: Operation,
  type: BlockType,
  data: unknown,
): void {
  const record = requireObject(operation, data, `block(${type}).data`)
  const allowed = BLOCK_DATA_FIELDS[type] as readonly string[]
  const unsupported = Object.keys(record).filter((key) => !allowed.includes(key))
  if (unsupported.length > 0) {
    fail(
      'INVALID_BLOCK_DATA',
      `block(${type}).data does not define: ${unsupported.join(', ')}`,
      operation,
    )
  }
}

/** Runs the data layer's own block schema check with an operation error code. */
export function requireValidBlock(operation: Operation, block: Block): void {
  try {
    validateBlock(block)
  } catch (error) {
    if (error instanceof ValidationError) {
      fail('INVALID_BLOCK_DATA', error.message, operation)
    }
    throw error
  }
}

export function requireBlockAnchor(
  operation: Operation,
  note: Note,
  after: BlockAnchorId | undefined,
  movingBlockId?: string,
): void {
  if (after === undefined || after === null) {
    return
  }
  if (typeof after !== 'string' || after.trim() === '') {
    fail('INVALID_POSITION', 'after_block_id must be a block id or null', operation)
  }
  if (after === movingBlockId) {
    fail('INVALID_POSITION', `after_block_id cannot be the moved block itself: ${after}`, operation)
  }
  if (!note.blocks.some((block) => block.id === after)) {
    fail('INVALID_POSITION', `after_block_id not found in note ${note.id}: ${after}`, operation)
  }
}

export function requireNode(operation: Operation, graph: Graph, nodeId: string): GraphNode {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) {
    fail('TARGET_NOT_FOUND', `Graph node not found: ${nodeId}`, operation)
  }
  return node
}

export function requireUnusedNodeId(operation: Operation, graph: Graph, nodeId: string): void {
  if (graph.nodes.some((node) => node.id === nodeId)) {
    fail('DUPLICATE_ID', `Graph node already exists: ${nodeId}`, operation)
  }
}

export function requireEdge(operation: Operation, graph: Graph, edgeId: string): GraphEdge {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId)
  if (!edge) {
    fail('TARGET_NOT_FOUND', `Graph edge not found: ${edgeId}`, operation)
  }
  return edge
}

export function requireUnusedEdgeId(operation: Operation, graph: Graph, edgeId: string): void {
  if (graph.edges.some((edge) => edge.id === edgeId)) {
    fail('DUPLICATE_ID', `Graph edge already exists: ${edgeId}`, operation)
  }
}

export function requireNodeType(operation: Operation, value: unknown): GraphNodeType {
  if (!isGraphNodeType(value)) {
    fail('INVALID_OPERATION', `Unsupported graph node type: ${String(value)}`, operation)
  }
  return value
}

export function requireEdgeType(operation: Operation, value: unknown): GraphEdgeType {
  if (!isGraphEdgeType(value)) {
    fail('INVALID_OPERATION', `Unsupported graph edge type: ${String(value)}`, operation)
  }
  return value
}

export function requirePosition(operation: Operation, value: unknown): GraphNodePosition {
  const record = requireObject(operation, value, 'position')
  const { x, y } = record
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    fail('INVALID_POSITION', 'position.x and position.y must be finite numbers', operation)
  }
  return { x, y }
}

/** Keeps edges inside the graph: both endpoints must exist, and no self-loops. */
export function requireEdgeEndpoints(
  operation: Operation,
  graph: Graph,
  source: string,
  target: string,
): void {
  if (source === target) {
    fail('INVALID_REFERENCE', `An edge cannot point at its own source: ${source}`, operation)
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  if (!nodeIds.has(source)) {
    fail('INVALID_REFERENCE', `edge.source references unknown node: ${source}`, operation)
  }
  if (!nodeIds.has(target)) {
    fail('INVALID_REFERENCE', `edge.target references unknown node: ${target}`, operation)
  }
}
