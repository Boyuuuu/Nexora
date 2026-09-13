import { createId, type BlockType, type GraphEdgeType, type GraphNodeType } from '../data'
import type { BlockInput, Operation } from '../operations'
import type { useKnowledgeStore } from '../stores/knowledgeStore'

export const PRODUCT_DEMO_NAME = 'AI / Machine Learning'

type Store = ReturnType<typeof useKnowledgeStore>

interface SeedBlock {
  type: BlockType
  data: BlockInput['data']
}

interface SeedNode {
  key: string
  label: string
  type: GraphNodeType
  note?: string
  position: { x: number; y: number }
}

const ATTENTION_BLOCKS: SeedBlock[] = [
  {
    type: 'concept',
    data: {
      title: '核心概念',
      content:
        'Attention 允许模型在每一步从整段序列中读取信息，并为每个位置分配不同的权重，而不是只看固定窗口。',
    },
  },
  {
    type: 'intuition',
    data: {
      title: '直觉理解',
      content:
        '可以把 Attention 理解成一次软查找：Query 提出问题，Key 声明每个位置能提供什么，Value 带着真正被取走的内容。',
    },
  },
  {
    type: 'math',
    data: {
      title: '数学表达',
      latex: 'Attention(Q, K, V) = softmax(QK^T / \\sqrt{d_k}) V',
      explanation: '除以 √d_k 是为了避免点积随维度增大而把 softmax 推向极端。',
    },
  },
  {
    type: 'example',
    data: {
      title: '例子',
      content:
        '在 “the cat sat because it was tired” 里，token “it” 会把大部分注意力放在 “cat” 上，从而消解代词。',
    },
  },
  {
    type: 'exploration',
    data: {
      title: '继续探索',
      items: [
        'Self-Attention 与 Cross-Attention 有什么不同？',
        '为什么需要 Q、K、V 三个投影，而不是复用同一组向量？',
        'Multi-Head Attention 在学什么不同的关系？',
      ],
    },
  },
]

const TRANSFORMER_BLOCKS: SeedBlock[] = [
  {
    type: 'concept',
    data: {
      title: '核心概念',
      content:
        'Transformer 用 Self-Attention 替代递推结构，让序列中的每个位置直接与其他位置交换信息。',
    },
  },
  {
    type: 'text',
    data: {
      title: 'Architecture',
      content:
        '典型结构是 Encoder / Decoder 堆叠。Encoder 建立上下文表示，Decoder 在生成时同时回看已生成内容与 Encoder 输出。',
    },
  },
  {
    type: 'example',
    data: {
      title: '例子',
      content: '机器翻译里，Encoder 阅读源句子，Decoder 逐步写出目标句子，每一步都通过 Attention 对齐源语言中的相关词。',
    },
  },
]

const SELF_ATTENTION_BLOCKS: SeedBlock[] = [
  {
    type: 'concept',
    data: {
      title: '核心概念',
      content: 'Self-Attention 让序列中的每个 token 从同一序列的其他 token 读取信息，是 Transformer 的基本计算单元。',
    },
  },
  {
    type: 'intuition',
    data: {
      title: '直觉理解',
      content: '每个位置同时扮演提问者与被检索者。同一组词既产生 Query，也产生 Key 与 Value。',
    },
  },
  {
    type: 'math',
    data: {
      title: 'QKV',
      latex: 'Q = XW_Q,\\; K = XW_K,\\; V = XW_V',
      explanation: '三个线性投影把同一输入映射到提问、检索与内容三个角色。',
    },
  },
]

const DEMO_NODES: SeedNode[] = [
  { key: 'transformer', label: 'Transformer', type: 'architecture', note: 'Transformer', position: { x: 360, y: 36 } },
  { key: 'attention', label: 'Attention', type: 'mechanism', note: 'Attention', position: { x: 140, y: 200 } },
  { key: 'encoder', label: 'Encoder', type: 'component', position: { x: 580, y: 200 } },
  { key: 'self-attention', label: 'Self-Attention', type: 'mechanism', note: 'Self-Attention', position: { x: 140, y: 364 } },
  { key: 'q', label: 'Q', type: 'component', position: { x: 20, y: 528 } },
  { key: 'k', label: 'K', type: 'component', position: { x: 160, y: 528 } },
  { key: 'v', label: 'V', type: 'component', position: { x: 300, y: 528 } },
]

const DEMO_EDGES: { source: string; target: string; type: GraphEdgeType }[] = [
  { source: 'transformer', target: 'attention', type: 'contains' },
  { source: 'transformer', target: 'encoder', type: 'contains' },
  { source: 'attention', target: 'self-attention', type: 'contains' },
  { source: 'self-attention', target: 'q', type: 'uses' },
  { source: 'self-attention', target: 'k', type: 'uses' },
  { source: 'self-attention', target: 'v', type: 'uses' },
]

export function findProductDemo(store: Store) {
  return store.workspaces.value.find((workspace) => workspace.metadata.name === PRODUCT_DEMO_NAME)
}

async function runRequired(store: Store, operation: Operation): Promise<void> {
  const result = await store.run(operation)
  if (!result.success) {
    throw new Error(result.error?.message ?? `Failed ${operation.operation}`)
  }
}

function toBlockInput(id: string, block: SeedBlock): BlockInput {
  const metadata = { source: 'import' as const }
  switch (block.type) {
    case 'concept':
      return { id, type: 'concept', data: block.data as Extract<BlockInput, { type: 'concept' }>['data'], metadata }
    case 'intuition':
      return { id, type: 'intuition', data: block.data as Extract<BlockInput, { type: 'intuition' }>['data'], metadata }
    case 'math':
      return { id, type: 'math', data: block.data as Extract<BlockInput, { type: 'math' }>['data'], metadata }
    case 'text':
      return { id, type: 'text', data: block.data as Extract<BlockInput, { type: 'text' }>['data'], metadata }
    case 'example':
      return { id, type: 'example', data: block.data as Extract<BlockInput, { type: 'example' }>['data'], metadata }
    case 'exploration':
      return { id, type: 'exploration', data: block.data as Extract<BlockInput, { type: 'exploration' }>['data'], metadata }
    case 'code':
      return { id, type: 'code', data: block.data as Extract<BlockInput, { type: 'code' }>['data'], metadata }
  }
}

async function addBlocks(store: Store, workspaceId: string, noteId: string, blocks: SeedBlock[]): Promise<void> {
  for (const block of blocks) {
    await runRequired(store, {
      operation: 'create_block',
      workspace_id: workspaceId,
      note_id: noteId,
      block: toBlockInput(createId('block'), block),
    })
  }
}

export async function seedProductDemo(store: Store): Promise<string> {
  const workspace = await store.createWorkspace(
    PRODUCT_DEMO_NAME,
    'A space for exploring attention, transformers, and how ideas connect.',
  )
  if (!workspace) {
    throw new Error('Could not create the demo workspace')
  }

  const attention = await store.createNote(workspace.id, 'Attention')
  const transformer = await store.createNote(workspace.id, 'Transformer')
  const selfAttention = await store.createNote(workspace.id, 'Self-Attention')
  if (!attention || !transformer || !selfAttention) {
    throw new Error('Could not create demo notes')
  }

  await addBlocks(store, workspace.id, attention.id, ATTENTION_BLOCKS)
  await addBlocks(store, workspace.id, transformer.id, TRANSFORMER_BLOCKS)
  await addBlocks(store, workspace.id, selfAttention.id, SELF_ATTENTION_BLOCKS)

  const notesByTitle: Record<string, string> = {
    Attention: attention.id,
    Transformer: transformer.id,
    'Self-Attention': selfAttention.id,
  }

  const nodeIds = new Map<string, string>()
  for (const node of DEMO_NODES) {
    const id = createId('node')
    nodeIds.set(node.key, id)
    const noteTitle = node.note
    await runRequired(store, {
      operation: 'create_node',
      workspace_id: workspace.id,
      node: {
        id,
        label: node.label,
        type: node.type,
        position: node.position,
        ...(noteTitle && notesByTitle[noteTitle] ? { note_id: notesByTitle[noteTitle] } : {}),
      },
    })
  }

  for (const edge of DEMO_EDGES) {
    const source = nodeIds.get(edge.source)
    const target = nodeIds.get(edge.target)
    if (!source || !target) continue
    await runRequired(store, {
      operation: 'create_edge',
      workspace_id: workspace.id,
      edge: { id: createId('edge'), source, target, type: edge.type },
    })
  }

  await store.selectWorkspace(workspace.id)
  await store.selectNote(attention.id)
  return attention.id
}

export async function ensureProductDemo(store: Store): Promise<string | null> {
  if (!findProductDemo(store)) {
    await seedProductDemo(store)
  }

  const existing = findProductDemo(store)
  if (!existing) return null

  await store.selectWorkspace(existing.id)
  const attention = store.notes.value.find((note) => note.title === 'Attention') ?? store.notes.value[0]
  if (attention) await store.selectNote(attention.id)
  return attention?.id ?? null
}
