import {
  BLOCK_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  type Block,
  type BlockType,
  type GraphEdgeType,
  type GraphNodeType,
} from '../data'

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  text: 'Text',
  concept: 'Concept',
  intuition: 'Intuition',
  math: 'Math',
  code: 'Code',
  example: 'Example',
  exploration: 'Exploration',
}

export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  architecture: 'Architecture',
  mechanism: 'Mechanism',
  component: 'Component',
  concept: 'Concept',
  topic: 'Topic',
  entity: 'Entity',
}

export const EDGE_TYPE_LABELS: Record<GraphEdgeType, string> = {
  contains: 'Contains',
  uses: 'Uses',
  relates: 'Related',
  depends_on: 'Depends on',
  explains: 'Explains',
}

export const ADDABLE_BLOCK_TYPES = BLOCK_TYPES
export const NODE_TYPE_OPTIONS = GRAPH_NODE_TYPES
export const EDGE_TYPE_OPTIONS = GRAPH_EDGE_TYPES

export function blockTitle(block: Block): string {
  const title = 'title' in block.data ? block.data.title : undefined
  return title?.trim() ? title : BLOCK_TYPE_LABELS[block.type]
}

export function blockBody(block: Block): string {
  switch (block.type) {
    case 'math':
      return block.data.latex
    case 'code':
      return block.data.code
    case 'exploration':
      return block.data.items.join('\n')
    default:
      return block.data.content
  }
}

export function nodeTypeFromBlock(type: BlockType): GraphNodeType {
  if (type === 'math') return 'mechanism'
  if (type === 'code') return 'component'
  return 'concept'
}
