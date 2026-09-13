import {
  graphRepository,
  type CreateGraphEdgeInput,
  type CreateGraphNodeInput,
  type Graph,
  type UpdateGraphNodeInput,
} from '../../data'
import type {
  CreateEdgeOperation,
  CreateNodeOperation,
  DeleteEdgeOperation,
  DeleteNodeOperation,
  GraphOperation,
  MoveNodeOperation,
  MoveNodesOperation,
  UpdateNodeOperation,
} from '../types'
import {
  requireChanges,
  requireEdge,
  requireEdgeEndpoints,
  requireEdgeType,
  requireId,
  requireNode,
  requireNodeType,
  requireNoteReference,
  requireObject,
  requirePosition,
  requireUnusedEdgeId,
  requireUnusedNodeId,
  requireWorkspace,
} from '../validation'
import { fail } from '../errors'

/** `update_node` may reach these; `position` belongs to the move operations. */
const NODE_CHANGE_FIELDS = ['label', 'type', 'note_id', 'metadata'] as const
const NODE_IDENTITY_FIELDS = ['id', 'workspace_id', 'position'] as const

/**
 * The graph is embedded in its workspace, so loading the parent already loads
 * the graph the operation addresses — no second read.
 */
async function loadGraph(operation: GraphOperation): Promise<Graph> {
  requireId(operation, operation.workspace_id, 'workspace_id')
  const workspace = await requireWorkspace(operation, operation.workspace_id)
  return workspace.graph
}

export async function handleCreateNode(operation: CreateNodeOperation): Promise<string[]> {
  const graph = await loadGraph(operation)

  requireObject(operation, operation.node, 'node')
  const input = operation.node
  const nodeId = requireId(operation, input.id, 'node.id')
  const label = requireId(operation, input.label, 'node.label')
  const type = requireNodeType(operation, input.type)

  requireUnusedNodeId(operation, graph, nodeId)
  if (input.note_id !== undefined) {
    await requireNoteReference(operation, operation.workspace_id, input.note_id)
  }
  const position = input.position === undefined ? undefined : requirePosition(operation, input.position)

  const create: CreateGraphNodeInput = {
    id: nodeId,
    label,
    type,
    ...(input.note_id === undefined ? {} : { noteId: input.note_id }),
    ...(position === undefined ? {} : { position }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  }

  await graphRepository.addNode(operation.workspace_id, create)
  return [nodeId]
}

export async function handleUpdateNode(operation: UpdateNodeOperation): Promise<string[]> {
  const graph = await loadGraph(operation)
  const nodeId = requireId(operation, operation.node_id, 'node_id')
  requireNode(operation, graph, nodeId)

  requireChanges(operation, operation.changes, NODE_CHANGE_FIELDS, NODE_IDENTITY_FIELDS)
  const changes = operation.changes

  const label = changes.label === undefined ? undefined : requireId(operation, changes.label, 'changes.label')
  const type = changes.type === undefined ? undefined : requireNodeType(operation, changes.type)

  if (changes.note_id !== undefined && changes.note_id !== null) {
    await requireNoteReference(operation, operation.workspace_id, changes.note_id)
  }
  if (changes.metadata !== undefined) {
    requireObject(operation, changes.metadata, 'changes.metadata')
  }

  const update: UpdateGraphNodeInput = {
    ...(label === undefined ? {} : { label }),
    ...(type === undefined ? {} : { type }),
    ...(changes.note_id === undefined ? {} : { noteId: changes.note_id }),
    ...(changes.metadata === undefined ? {} : { metadata: changes.metadata }),
  }

  await graphRepository.updateNode(operation.workspace_id, nodeId, update)
  return [nodeId]
}

export async function handleMoveNode(operation: MoveNodeOperation): Promise<string[]> {
  const graph = await loadGraph(operation)
  const nodeId = requireId(operation, operation.node_id, 'node_id')
  requireNode(operation, graph, nodeId)

  const position = requirePosition(operation, operation.position)

  await graphRepository.updateNode(operation.workspace_id, nodeId, { position })
  return [nodeId]
}

export async function handleMoveNodes(operation: MoveNodesOperation): Promise<string[]> {
  const graph = await loadGraph(operation)
  if (!Array.isArray(operation.positions) || !operation.positions.length) {
    fail('INVALID_OPERATION', 'positions must be a non-empty array', operation)
  }
  const seen = new Set<string>()
  const positions = operation.positions.map(item => {
    requireObject(operation, item, 'positions entry')
    const nodeId = requireId(operation, item.node_id, 'node_id')
    requireNode(operation, graph, nodeId)
    if (seen.has(nodeId)) fail('INVALID_OPERATION', 'positions contains a duplicate node', operation)
    seen.add(nodeId)
    return { nodeId, position: item.position === null ? null : requirePosition(operation, item.position) }
  })
  await graphRepository.moveNodes(operation.workspace_id, positions)
  return [...seen]
}

/** Deleting a node cascades to its edges, all of which are reported back. */
export async function handleDeleteNode(operation: DeleteNodeOperation): Promise<string[]> {
  const graph = await loadGraph(operation)
  const nodeId = requireId(operation, operation.node_id, 'node_id')
  requireNode(operation, graph, nodeId)

  const removedEdgeIds = await graphRepository.removeNode(operation.workspace_id, nodeId)
  return [nodeId, ...removedEdgeIds]
}

export async function handleCreateEdge(operation: CreateEdgeOperation): Promise<string[]> {
  const graph = await loadGraph(operation)

  requireObject(operation, operation.edge, 'edge')
  const input = operation.edge
  const edgeId = requireId(operation, input.id, 'edge.id')
  const source = requireId(operation, input.source, 'edge.source')
  const target = requireId(operation, input.target, 'edge.target')
  const type = requireEdgeType(operation, input.type)

  requireUnusedEdgeId(operation, graph, edgeId)
  requireEdgeEndpoints(operation, graph, source, target)

  const create: CreateGraphEdgeInput = {
    id: edgeId,
    source,
    target,
    type,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  }

  await graphRepository.addEdge(operation.workspace_id, create)
  return [edgeId]
}

export async function handleDeleteEdge(operation: DeleteEdgeOperation): Promise<string[]> {
  const graph = await loadGraph(operation)
  const edgeId = requireId(operation, operation.edge_id, 'edge_id')
  requireEdge(operation, graph, edgeId)

  await graphRepository.removeEdge(operation.workspace_id, edgeId)
  return [edgeId]
}
