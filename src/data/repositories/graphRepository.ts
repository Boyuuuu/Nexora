import { runTransaction, type TransactionContext } from '../db/database'
import { STORES, type StoreName } from '../db/schema'
import type {
  Graph,
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphNodePosition,
  GraphNodeType,
} from '../models/graph'
import type { Note } from '../models/note'
import { createId } from '../utils/id'
import { validateGraph, validateGraphEdge, validateGraphNode, ValidationError } from '../validation'
import { ConflictError, loadWorkspace, NotFoundError, saveWorkspace } from './internal'

export interface CreateGraphNodeInput {
  /** Defaults to a generated id; callers that own the id (Operations) pass one. */
  id?: string
  label: string
  type: GraphNodeType
  noteId?: string
  position?: GraphNodePosition
  metadata?: Record<string, unknown>
}

export interface CreateGraphEdgeInput {
  /** Defaults to a generated id; callers that own the id (Operations) pass one. */
  id?: string
  source: string
  target: string
  type: GraphEdgeType
  metadata?: Record<string, unknown>
}

export interface UpdateGraphNodeInput {
  label?: string
  type?: GraphNodeType
  /** `null` detaches the node from its note. */
  noteId?: string | null
  /** `null` clears the canvas position. */
  position?: GraphNodePosition | null
  metadata?: Record<string, unknown>
}

/**
 * The graph is embedded in its Workspace record, so every write rewrites it.
 * `validateGraph` runs inside the transaction, which is what keeps a rejected
 * write from leaving duplicate ids or dangling edges behind.
 */
async function mutateGraph(
  workspaceId: string,
  stores: StoreName | StoreName[],
  mutate: (graph: Graph, ctx: TransactionContext) => Promise<Graph> | Graph,
): Promise<Graph> {
  return runTransaction(stores, 'readwrite', async (ctx) => {
    const workspace = await loadWorkspace(ctx, workspaceId)
    const graph = await mutate(workspace.graph, ctx)
    validateGraph(graph, workspaceId)
    await saveWorkspace(ctx, { ...workspace, graph })
    return graph
  })
}

export const graphRepository = {
  getGraph(workspaceId: string): Promise<Graph> {
    return runTransaction(STORES.workspaces, 'readonly', async (ctx) =>
      (await loadWorkspace(ctx, workspaceId)).graph,
    )
  },

  async getNodes(workspaceId: string): Promise<GraphNode[]> {
    return (await graphRepository.getGraph(workspaceId)).nodes
  },

  async getEdges(workspaceId: string): Promise<GraphEdge[]> {
    return (await graphRepository.getGraph(workspaceId)).edges
  },

  async addNode(workspaceId: string, input: CreateGraphNodeInput): Promise<GraphNode> {
    const node: GraphNode = {
      id: input.id ?? createId('node'),
      workspaceId,
      label: input.label,
      type: input.type,
      ...(input.noteId === undefined ? {} : { noteId: input.noteId }),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }
    validateGraphNode(node, workspaceId)

    await mutateGraph(workspaceId, [STORES.workspaces, STORES.notes], async (graph, ctx) => {
      await assertNoteExists(ctx, workspaceId, node.noteId)
      if (graph.nodes.some((existing) => existing.id === node.id)) {
        throw new ConflictError(`Graph node already exists: ${node.id}`)
      }
      return { ...graph, nodes: [...graph.nodes, node] }
    })

    return node
  },

  async updateNode(
    workspaceId: string,
    nodeId: string,
    changes: UpdateGraphNodeInput,
  ): Promise<GraphNode> {
    let updated: GraphNode | undefined

    await mutateGraph(workspaceId, [STORES.workspaces, STORES.notes], async (graph, ctx) => {
      const current = graph.nodes.find((node) => node.id === nodeId)
      if (!current) {
        throw new NotFoundError(`Graph node not found: ${nodeId}`)
      }

      const { noteId: currentNoteId, position: currentPosition, ...base } = current
      const nextNoteId = changes.noteId === undefined ? currentNoteId : changes.noteId
      const nextPosition = changes.position === undefined ? currentPosition : changes.position

      const next: GraphNode = {
        ...base,
        ...(changes.label === undefined ? {} : { label: changes.label }),
        ...(changes.type === undefined ? {} : { type: changes.type }),
        ...(changes.metadata === undefined ? {} : { metadata: changes.metadata }),
        ...(nextNoteId === null || nextNoteId === undefined ? {} : { noteId: nextNoteId }),
        ...(nextPosition === null || nextPosition === undefined ? {} : { position: nextPosition }),
      }

      validateGraphNode(next, workspaceId)
      await assertNoteExists(ctx, workspaceId, next.noteId)
      updated = next

      return { ...graph, nodes: graph.nodes.map((node) => (node.id === nodeId ? next : node)) }
    })

    if (!updated) {
      throw new NotFoundError(`Graph node not found: ${nodeId}`)
    }
    return updated
  },

  /**
   * Removing a node also removes every edge touching it; the ids of those
   * cascaded edges are returned so callers can report what they changed.
   */
  async removeNode(workspaceId: string, nodeId: string): Promise<string[]> {
    const removedEdgeIds: string[] = []

    await mutateGraph(workspaceId, STORES.workspaces, (graph) => {
      if (!graph.nodes.some((node) => node.id === nodeId)) {
        throw new NotFoundError(`Graph node not found: ${nodeId}`)
      }

      removedEdgeIds.length = 0
      const edges: GraphEdge[] = []
      for (const edge of graph.edges) {
        if (edge.source === nodeId || edge.target === nodeId) {
          removedEdgeIds.push(edge.id)
        } else {
          edges.push(edge)
        }
      }

      return { nodes: graph.nodes.filter((node) => node.id !== nodeId), edges }
    })

    return removedEdgeIds
  },

  /** Save the whole layout in one transaction, preserving notes, metadata and relationships. */
  async moveNodes(workspaceId: string, positions: { nodeId: string; position: GraphNodePosition | null }[]): Promise<void> {
    await mutateGraph(workspaceId, STORES.workspaces, (graph) => {
      const changes = new Map(positions.map(item => [item.nodeId, item.position]))
      if (changes.size !== positions.length) throw new ValidationError('Duplicate node in layout')
      const ids = new Set(graph.nodes.map(node => node.id))
      for (const id of changes.keys()) if (!ids.has(id)) throw new NotFoundError(`Graph node not found: ${id}`)
      return { ...graph, nodes: graph.nodes.map(node => {
        if (!changes.has(node.id)) return node
        const { position: _previous, ...base } = node
        const position = changes.get(node.id)
        return position === null ? base : { ...base, position }
      }) }
    })
  },

  async addEdge(workspaceId: string, input: CreateGraphEdgeInput): Promise<GraphEdge> {
    const edge: GraphEdge = {
      id: input.id ?? createId('edge'),
      workspaceId,
      source: input.source,
      target: input.target,
      type: input.type,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }

    await mutateGraph(workspaceId, STORES.workspaces, (graph) => {
      validateGraphEdge(edge, workspaceId, new Set(graph.nodes.map((node) => node.id)))
      if (graph.edges.some((existing) => existing.id === edge.id)) {
        throw new ConflictError(`Graph edge already exists: ${edge.id}`)
      }
      return { ...graph, edges: [...graph.edges, edge] }
    })

    return edge
  },

  async removeEdge(workspaceId: string, edgeId: string): Promise<void> {
    await mutateGraph(workspaceId, STORES.workspaces, (graph) => {
      if (!graph.edges.some((edge) => edge.id === edgeId)) {
        throw new NotFoundError(`Graph edge not found: ${edgeId}`)
      }
      return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) }
    })
  },
}

async function assertNoteExists(
  ctx: TransactionContext,
  workspaceId: string,
  noteId: string | undefined,
): Promise<void> {
  if (noteId === undefined) {
    return
  }

  const note = await ctx.store<Note>(STORES.notes).get(noteId)
  if (!note) {
    throw new ValidationError(`graphNode.noteId references unknown note: ${noteId}`)
  }
  if (note.workspaceId !== workspaceId) {
    throw new ValidationError(`graphNode.noteId belongs to another workspace: ${noteId}`)
  }
}
