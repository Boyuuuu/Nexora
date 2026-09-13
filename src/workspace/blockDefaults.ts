import type { Block, BlockType } from '../data'
import type { BlockInput } from '../operations'

export function defaultBlockInput(id: string, type: BlockType): BlockInput {
  const metadata = { source: 'user' as const }

  switch (type) {
    case 'text':
      return { id, type, data: { title: 'Text', content: '' }, metadata }
    case 'concept':
      return { id, type, data: { title: 'Concept', content: '' }, metadata }
    case 'intuition':
      return { id, type, data: { title: 'Intuition', content: '' }, metadata }
    case 'math':
      return { id, type, data: { title: 'Math', latex: '', explanation: '' }, metadata }
    case 'code':
      return { id, type, data: { title: 'Code', language: 'text', code: '' }, metadata }
    case 'example':
      return { id, type, data: { title: 'Example', content: '' }, metadata }
    case 'exploration':
      return { id, type, data: { title: 'Exploration', items: [''] }, metadata }
  }
}

export function duplicateBlockInput(id: string, source: Block): BlockInput {
  const metadata = { source: 'user' as const, tags: source.metadata.tags }

  switch (source.type) {
    case 'text':
      return { id, type: 'text', data: { ...source.data }, metadata }
    case 'concept':
      return { id, type: 'concept', data: { ...source.data }, metadata }
    case 'intuition':
      return { id, type: 'intuition', data: { ...source.data }, metadata }
    case 'math':
      return { id, type: 'math', data: { ...source.data }, metadata }
    case 'code':
      return { id, type: 'code', data: { ...source.data }, metadata }
    case 'example':
      return { id, type: 'example', data: { ...source.data }, metadata }
    case 'exploration':
      return {
        id,
        type: 'exploration',
        data: { items: [...source.data.items], title: source.data.title },
        metadata,
      }
  }
}
