import type { Note } from '../data'
import type { EditPatch } from './protocol'

/** Formatting only: preserve facts, URLs, negative numbers, code and LaTeX. */
export function cleanNoteProse(value: string): string {
  return value.replace(/\r\n?/g, '\n')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/^ {0,3}>\s?/gm, '')
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s（(])\*([^*\n]+)\*(?=$|[\s，。！？,.!?:;）)])/gm, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1（$2）')
    .replace(/^ {0,3}[-*]\s+(?!\d)/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim()
}

function readableProse(value: string): string {
  // A Markdown table or fenced program cannot be safely turned into prose by deleting symbols.
  if (/^\s*(?:```|~~~)|^\s*\|.*\|\s*$/m.test(value)) {
    throw new Error('正文含表格或代码围栏：请把表格改成简洁对比句，代码移到 code 类型。')
  }
  if (/<\/?[a-z][^>]*>|\$\$[\s\S]+\$\$/i.test(value)) {
    throw new Error('正文不要包含 HTML 标签或公式包裹符号，请将公式放入 math 类型。')
  }
  const result = cleanNoteProse(value)
  if (/^(?:好的[，,！!。\s]|总结如下|整理如下|以下是|当然可以)/.test(result)) {
    throw new Error('请去掉聊天套话，直接写知识结论。')
  }
  return result
}

function fingerprint(value: string): string {
  return cleanNoteProse(value).replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
}

/** Detect extensive verbatim prose across blocks. This is a quality heuristic, not a fact checker. */
function mostlyCopied(bodies: string[], source: string): boolean {
  const original = fingerprint(source)
  const prose = bodies.map(fingerprint).filter((text) => text.length >= 60)
  let matched = 0, total = 0
  for (const text of prose) {
    for (let i = 0; i + 40 <= text.length; i += 40) {
      total += 40
      if (original.includes(text.slice(i, i + 40))) matched += 40
    }
  }
  return total >= 200 && matched / total > 0.8
}

export function prepareOrganizedPatches(patches: EditPatch[], note: Note, answer: string): EditPatch[] {
  const prose: string[] = []
  const seen = new Set<string>()
  const next: EditPatch[] = []
  for (const patch of patches) {
    if (!patch.data || !patch.type) { next.push(patch); continue }
    const existing = note.blocks.find((block) => block.id === patch.block_id)
    const data = { ...patch.data }
    const title = cleanNoteProse(data.title?.trim() || existing?.data.title || '').replace(/\s*\n\s*/g, ' ')
    if (!/[\p{L}\p{N}]/u.test(title) || /^(?:text|concept|intuition|example|math|code|exploration|untitled|未命名)$/i.test(title)) {
      throw new Error('每个知识块都需要具体标题，请用 title 写出本块的主题。')
    }
    if (title.length > 80) throw new Error('标题过长，请把细节移到正文。')
    data.title = title
    if ('content' in data) {
      data.content = readableProse(data.content)
      // Avoid showing the same title twice.
      const lines = data.content.split('\n')
      if (lines[0]?.trim() === title) data.content = lines.slice(1).join('\n').trim()
      if (!data.content.trim()) throw new Error('整理结果只有标题，请补充知识内容。')
      if (data.content.length > 1600) throw new Error('单个知识块过长，请提炼重点或按独立主题拆分。')
      const key = fingerprint(data.content)
      if (seen.has(key)) throw new Error('本次新增内容重复，请合并相同知识点。')
      seen.add(key)
      if (patch.action === 'create' && note.blocks.some((block) => 'content' in block.data && fingerprint(block.data.content) === key)) {
        throw new Error('新增内容与已有块重复，请更新已有块或返回空改动。')
      }
      prose.push(data.content)
    }
    if ('items' in data) {
      data.items = [...new Set(data.items.map((item) => readableProse(item).replace(/^(?:[•*-]|\d+[.)])\s+/, '')).filter(Boolean))]
      if (!data.items.length) throw new Error('探索列表没有有效内容。')
      prose.push(...data.items)
    }
    if ('explanation' in data && data.explanation) data.explanation = readableProse(data.explanation)
    if ('code' in data && /^\s*(?:```|~~~)/m.test(data.code)) throw new Error('code 字段只保留代码，不要包含代码围栏。')
    if ('latex' in data && /^\s*(?:\$|\\\[)|(?:\$|\\\])\s*$/.test(data.latex)) throw new Error('latex 字段不需要美元符号或公式外框。')
    // Do not normalize code or LaTeX with prose regexes.
    if (existing && existing.type === patch.type && JSON.stringify(existing.data) === JSON.stringify(data)) continue
    next.push({ ...patch, data })
  }
  if (mostlyCopied(prose, answer)) throw new Error('正文大段照抄了回答：请重新提炼结论、原因和一个必要例子。')
  return next
}
