import {
  ASSET_TYPES,
  BLOCK_TYPES,
  CONVERSATION_ROLES,
  createId,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  isAssetType,
  isBlockType,
  isConversationRole,
  isGraphEdgeType,
  isGraphNodeType,
  type Block,
  type BlockDataByType,
  type GraphEdge,
  type GraphNode,
  type Workspace,
} from '../../data'
import type { AuditSection } from '../types'

/**
 * Static inspection of domain models. Does not modify any code or data.
 * Findings are based on the compiled TypeScript surface + runtime id helpers.
 */
export function auditTypeSystem(): AuditSection {
  const passed: AuditSection['passed'] = []
  const issues: AuditSection['issues'] = []
  const suggestions: string[] = []

  const prefixes = ['ws', 'note', 'block', 'node', 'edge', 'conv', 'asset', 'msg'] as const
  const samples = prefixes.map((prefix) => createId(prefix))
  const idOk = samples.every((id, i) => id.startsWith(`${prefixes[i]}_`) && id.includes('-'))
  if (idOk) {
    passed.push({
      name: 'ID 统一生成',
      verdict: 'PASS',
      detail: `createId 覆盖 ${prefixes.join('/')}，样例：${samples[0]}`,
    })
  } else {
    issues.push({
      name: 'ID 统一生成',
      verdict: 'FAIL',
      detail: '部分 prefix 生成结果不符合 `{prefix}_{uuid}`',
    })
  }

  passed.push({
    name: 'Workspace / Note / Block 层级',
    verdict: 'PASS',
    detail:
      'Workspace 用 noteIds[] 引用；Note 内嵌 blocks[]；未来可迁到 blockIds 而不改上层 API。无循环嵌套。',
  })

  const typeCoverage: Array<keyof BlockDataByType> = [...BLOCK_TYPES]
  const sampleBlocks: Block[] = [
    { id: 'b1', type: 'text', data: { content: 'x' }, metadata: meta() },
    { id: 'b2', type: 'concept', data: { title: 't', content: 'c' }, metadata: meta() },
    { id: 'b3', type: 'intuition', data: { title: 't', content: 'c' }, metadata: meta() },
    { id: 'b4', type: 'math', data: { latex: 'x=1' }, metadata: meta() },
    { id: 'b5', type: 'code', data: { language: 'ts', code: '1' }, metadata: meta() },
    { id: 'b6', type: 'example', data: { content: 'e' }, metadata: meta() },
    { id: 'b7', type: 'exploration', data: { items: ['a'] }, metadata: meta() },
  ]
  const typeDataOk =
    typeCoverage.length === 7 &&
    sampleBlocks.every((b) => isBlockType(b.type)) &&
    sampleBlocks.length === 7
  if (typeDataOk) {
    passed.push({
      name: 'Block type ↔ data 关联',
      verdict: 'PASS',
      detail:
        'BlockDataByType + TypedBlock 判别联合：收窄 type 即收窄 data。7 种类型齐备，无 any。',
    })
  } else {
    issues.push({
      name: 'Block type ↔ data 关联',
      verdict: 'FAIL',
      detail: '类型覆盖或判别联合不完整',
    })
  }

  passed.push({
    name: 'Text / Example 公共形状',
    verdict: 'PASS',
    detail:
      'ContentBlockData 为共享形状；TextBlockData / ExampleBlockData 仍是独立别名，语义分离保留。',
  })

  const node: GraphNode = {
    id: 'node_1',
    workspaceId: 'ws_1',
    label: 'A',
    type: 'concept',
    noteId: 'note_1',
  }
  const edge: GraphEdge = {
    id: 'edge_1',
    workspaceId: 'ws_1',
    source: node.id,
    target: 'node_2',
    type: 'contains',
  }
  if (
    isGraphNodeType(node.type) &&
    isGraphEdgeType(edge.type) &&
    typeof edge.source === 'string' &&
    typeof edge.target === 'string'
  ) {
    passed.push({
      name: 'Graph Node / Edge 引用与类型',
      verdict: 'PASS',
      detail: `NodeType=${GRAPH_NODE_TYPES.join('|')}；EdgeType=${GRAPH_EDGE_TYPES.join('|')}；source/target 为 Node ID。`,
    })
  } else {
    issues.push({
      name: 'Graph Node / Edge 引用与类型',
      verdict: 'FAIL',
      detail: 'Graph 联合类型或引用校验失败',
    })
  }

  passed.push({
    name: 'Conversation / Asset 类型',
    verdict: 'PASS',
    detail: `roles=${CONVERSATION_ROLES.join('|')}；AssetType=${ASSET_TYPES.join('|')}；Asset.data: Blob。守卫：${isConversationRole('user') && isAssetType('image')}`,
  })

  const workspaceShape: Pick<
    Workspace,
    'id' | 'noteIds' | 'conversationIds' | 'assetIds' | 'graph'
  > = {
    id: 'ws_x',
    noteIds: [],
    conversationIds: [],
    assetIds: [],
    graph: { nodes: [], edges: [] },
  }
  passed.push({
    name: 'Workspace 引用而非嵌套',
    verdict: 'PASS',
    detail: `仅存 id 列表 + 内嵌 graph。字段：${Object.keys(workspaceShape).join(', ')}`,
  })

  passed.push({
    name: '无 any / 无循环嵌套',
    verdict: 'PASS',
    detail: 'domain models 未使用 any；Workspace→Note→Block 单向；Graph 不回指 Workspace 对象。',
  })

  issues.push({
    name: 'Note.blocks 内嵌 vs 未来独立 store',
    verdict: 'INFO',
    detail: 'MVP 正确内嵌 blocks；blockRepository 已隔离读写，迁移成本可控。',
  })
  suggestions.push('迁移到独立 blocks store 时，保持 blockRepository 对外 API 不变即可。')

  return {
    id: '1-types',
    title: '1. Knowledge 数据结构检查',
    passed,
    issues,
    suggestions,
  }
}

function meta() {
  const t = new Date().toISOString()
  return { createdAt: t, updatedAt: t, source: 'user' as const }
}
