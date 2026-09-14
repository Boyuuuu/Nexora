import type { Block, Graph, Note } from '../data'
import { blockBody, blockTitle } from '../workspace/labels'
import { MAX_EDIT_BLOCKS, type QuoteRef } from './protocol'
import { formatZhihuSearchForPrompt, type ZhihuSearchItem } from './zhihuSearch'

const BLOCK_PREVIEW = 280

function clip(text: string, max = BLOCK_PREVIEW): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function summarizeBlock(block: Block, index: number): string {
  const body = clip(blockBody(block))
  const title = blockTitle(block)
  return `${index + 1}. [${block.id}] ${block.type} · ${title}${body ? ` — ${body}` : ''}`
}

export function buildGraphSketch(graph: Graph, noteId: string): string {
  const linked = graph.nodes.filter((node) => node.noteId === noteId)
  if (!linked.length && !graph.nodes.length) {
    return '（当前工作区还没有知识图节点）'
  }

  const linkedIds = new Set(linked.map((node) => node.id))
  const neighborIds = new Set<string>()
  const relatedEdges = graph.edges.filter((edge) => linkedIds.has(edge.source) || linkedIds.has(edge.target))
  for (const edge of relatedEdges) {
    neighborIds.add(edge.source)
    neighborIds.add(edge.target)
  }
  linkedIds.forEach((id) => neighborIds.delete(id))

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const lines: string[] = []
  if (linked.length) {
    lines.push('绑定到本笔记的节点：')
    for (const node of linked) {
      lines.push(`- ${node.label} (${node.type}, ${node.id})`)
    }
  } else {
    lines.push('本笔记尚未绑定任何图节点。')
  }

  const neighbors = [...neighborIds].map((id) => byId.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node))
  if (neighbors.length) {
    lines.push('一跳邻居（只含标签，不含其他笔记正文）：')
    for (const node of neighbors.slice(0, 24)) {
      lines.push(`- ${node.label} (${node.type}${node.noteId ? ', 另有笔记' : ''})`)
    }
  }

  if (relatedEdges.length) {
    lines.push('相关关系：')
    for (const edge of relatedEdges.slice(0, 32)) {
      const source = byId.get(edge.source)?.label ?? edge.source
      const target = byId.get(edge.target)?.label ?? edge.target
      lines.push(`- ${source} -[${edge.type}]-> ${target}`)
    }
  }

  return lines.join('\n')
}

export function buildNoteIndex(note: Note): string {
  if (!note.blocks.length) return '这篇笔记目前没有 block。'
  return note.blocks.map((block, index) => summarizeBlock(block, index)).join('\n')
}

export function buildQuoteSection(quotes: QuoteRef[], note: Note): string {
  if (!quotes.length) return '（用户没有引用具体文字）'
  return quotes.map((quote, index) => {
    const block = note.blocks.find((item) => item.id === quote.blockId)
    const where = block ? `${block.type} / ${blockTitle(block)}` : quote.blockId
    return `${index + 1}. 来自 ${where} [${quote.blockId}]:\n"""${quote.text}"""`
  }).join('\n\n')
}

export function buildSelectedBlockBodies(note: Note, blockIds: string[]): string {
  const unique = [...new Set(blockIds.filter(Boolean))]
  if (!unique.length) return '（未指定要展开的 block）'
  return unique.map((id) => {
    const block = note.blocks.find((item) => item.id === id)
    if (!block) return `- ${id}: （已不存在）`
    return `- ${id} (${block.type})\n${JSON.stringify(block.data, null, 2)}`
  }).join('\n\n')
}

export function buildEditUserPrompt(input: {
  instruction: string
  note: Note
  graph: Graph
  quotes: QuoteRef[]
  rewrite: boolean
  languageHint: string
  zhihuSearchItems?: ZhihuSearchItem[]
}): string {
  const searchBlock = input.zhihuSearchItems?.length
    ? [
        '',
        '知乎站内搜索摘录（仅供参考，不要大段照抄；可吸收观点与事实，用自己的话写进笔记）：',
        formatZhihuSearchForPrompt(input.zhihuSearchItems),
      ]
    : []

  return [
    `我想改这篇学习笔记，具体需求是：${input.instruction}`,
    '',
    `当前模式：${input.rewrite ? '可以较大范围重写，但仍必须满足上面的需求' : `小范围编辑，最多改 ${MAX_EDIT_BLOCKS} 个相关块`}`,
    `笔记标题：${input.note.title}`,
    '',
    '现有知识图（仅供参考，不要编造）：',
    buildGraphSketch(input.graph, input.note.id),
    '',
    '当前笔记的块列表：',
    buildNoteIndex(input.note),
    '',
    '我引用的原文：',
    buildQuoteSection(input.quotes, input.note),
    ...searchBlock,
    '',
    input.languageHint,
    '请输出符合 edit_plan schema 的计划。',
  ].join('\n')
}
