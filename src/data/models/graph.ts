export const GRAPH_NODE_TYPES = [
  'architecture',
  'mechanism',
  'component',
  'concept',
  'topic',
  'entity',
] as const

export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number]

export const GRAPH_EDGE_TYPES = [
  'contains',
  'uses',
  'relates',
  'depends_on',
  'explains',
] as const

export type GraphEdgeType = (typeof GRAPH_EDGE_TYPES)[number]

/** Canvas coordinates. Stored with the node so a layout survives reloads. */
export interface GraphNodePosition {
  x: number
  y: number
}

export interface GraphNode {
  id: string
  workspaceId: string
  label: string
  type: GraphNodeType
  /** Optional link to the Note that explains this node. */
  noteId?: string
  /** Optional link to a Block when this node belongs to a Note subgraph. */
  blockId?: string
  /** Absent until the node has been placed on a canvas. */
  position?: GraphNodePosition
  metadata?: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  workspaceId: string
  /** GraphNode id. */
  source: string
  /** GraphNode id. */
  target: string
  type: GraphEdgeType
  metadata?: Record<string, unknown>
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function createEmptyGraph(): Graph {
  return { nodes: [], edges: [] }
}

export function isGraphNodeType(value: unknown): value is GraphNodeType {
  return typeof value === 'string' && (GRAPH_NODE_TYPES as readonly string[]).includes(value)
}

export function isGraphEdgeType(value: unknown): value is GraphEdgeType {
  return typeof value === 'string' && (GRAPH_EDGE_TYPES as readonly string[]).includes(value)
}
