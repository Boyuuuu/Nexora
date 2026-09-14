import type { Block } from '../data'
import { BLOCK_TYPE_LABELS } from '../workspace/labels'

export interface DiffLine { text: string; changed: boolean }

/** Line alignment keeps unchanged paragraphs neutral, including repeated lines. */
export function diffLines(before: string, after: string): { before: DiffLine[]; after: DiffLine[] } {
  const a = before ? before.split('\n') : [], b = after ? after.split('\n') : []
  const left = a.map((text) => ({ text, changed: true })), right = b.map((text) => ({ text, changed: true }))
  if (a.length * b.length > 250_000) {
    a.forEach((text, i) => { if (text === b[i]) { left[i]!.changed = false; right[i]!.changed = false } })
    return { before: left, after: right }
  }
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i]![j] = a[i] === b[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
  }
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { left[i++]!.changed = false; right[j++]!.changed = false }
    else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++
    else j++
  }
  return { before: left, after: right }
}

const labels: Record<string, string> = { type: '类型', title: '标题', content: '正文', language: '语言', code: '代码', latex: '公式', explanation: '公式说明', items: '探索问题' }
function fields(block?: Block | null): Record<string, string> {
  if (!block) return {}
  return Object.fromEntries(Object.entries({ type: BLOCK_TYPE_LABELS[block.type], ...block.data })
    .map(([key, value]) => [key, Array.isArray(value) ? value.map((text) => `• ${text}`).join('\n') : value ?? '']))
}
export function blockDiff(before?: Block | null, after?: Block | null) {
  const a = fields(before), b = fields(after)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) => {
    if (!a[key] && !b[key]) return []
    return [{ key, label: labels[key] ?? key, changed: a[key] !== b[key], ...diffLines(a[key] ?? '', b[key] ?? '') }]
  })
}
