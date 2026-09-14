import {
  BLOCK_DATA_FIELDS,
  isBlockType,
  type Block,
  type BlockDataByType,
  type BlockType,
} from '../data'

export const MAX_EDIT_BLOCKS = 5

export type EditAction = 'update' | 'replace' | 'create' | 'delete' | 'move'
export type EditMode = 'edit' | 'rewrite'

export interface QuoteRef {
  id: string
  blockId: string
  text: string
}

export interface EditTarget {
  key: string
  action: EditAction
  block_id?: string
  after_block_id?: string | null
  type?: BlockType
  intent: string
  selected: boolean
}

export interface EditPlan {
  mode: EditMode
  summary: string
  targets: EditTarget[]
}

export interface EditPatch {
  action: EditAction
  block_id?: string
  after_block_id?: string | null
  type?: BlockType
  data?: BlockDataByType[BlockType]
  intent?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function coerceBlockData(type: BlockType, data: unknown): BlockDataByType[BlockType] {
  const record = asRecord(data) ?? {}
  const title = asString(record.title)
  switch (type) {
    case 'math':
      return { title, latex: asString(record.latex), explanation: asString(record.explanation) }
    case 'code':
      return {
        title,
        language: asString(record.language).trim() || 'text',
        code: asString(record.code),
      }
    case 'exploration':
      return {
        title,
        items: Array.isArray(record.items)
          ? record.items.map((item) => asString(item)).filter((item) => item.trim())
          : asString(record.content).split('\n').map((item) => item.trim()).filter(Boolean),
      }
    case 'concept':
    case 'intuition':
      return { title: title || type, content: asString(record.content) }
    default:
      return { title, content: asString(record.content) }
  }
}

export function validateTypedData(type: BlockType, data: BlockDataByType[BlockType]): string | null {
  if (type === 'math') {
    const math = data as BlockDataByType['math']
    if (!math.latex.trim()) return 'math 块必须包含可渲染的 LaTeX；否则请改成其他类型。'
  }
  if (type === 'code') {
    const code = data as BlockDataByType['code']
    if (!code.code.trim()) return 'code 块必须包含代码；否则请改成其他类型。'
  }
  const allowed = BLOCK_DATA_FIELDS[type] as readonly string[]
  const extra = Object.keys(data).filter((key) => !allowed.includes(key))
  if (extra.length) return `${type} 不支持字段：${extra.join(', ')}`
  return null
}

export function previewLabel(action: EditAction): string {
  switch (action) {
    case 'create': return '新增'
    case 'delete': return '删除'
    case 'move': return '移动'
    case 'replace': return '转换'
    default: return '修改'
  }
}

function parseAction(value: unknown): EditAction | null {
  return value === 'update' || value === 'replace' || value === 'create'
    || value === 'delete' || value === 'move'
    ? value
    : null
}

function nullableId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = asString(value).trim()
  return text || undefined
}

export function parseEditPlan(raw: unknown, noteBlocks: Block[], mode: EditMode): EditPlan {
  const record = asRecord(raw)
  if (!record) throw new Error('结构化模型没有返回可解析的计划对象。')
  const summary = asString(record.summary).trim() || '准备修改这篇笔记。'
  const plannedMode = record.mode === 'rewrite' || mode === 'rewrite' ? 'rewrite' : 'edit'
  const list = Array.isArray(record.targets) ? record.targets : []
  const known = new Set(noteBlocks.map((block) => block.id))
  const targets: EditTarget[] = []

  list.forEach((item, index) => {
    const row = asRecord(item)
    if (!row) return
    const action = parseAction(row.action)
    if (!action) return
    const blockId = nullableId(row.block_id)
    const typeRaw = nullableId(row.type)
    const type = typeRaw && isBlockType(typeRaw) ? typeRaw : undefined
    if (action !== 'create' && (!blockId || !known.has(blockId))) return
    const after = row.after_block_id === null
      ? null
      : nullableId(row.after_block_id)
    targets.push({
      key: `${action}:${blockId ?? `new-${index}`}`,
      action,
      ...(blockId ? { block_id: blockId } : {}),
      ...(after !== undefined ? { after_block_id: after } : {}),
      ...(type ? { type } : {}),
      intent: asString(row.intent).trim() || '优化这个块',
      selected: row.selected === false ? false : true,
    })
  })

  if (!targets.length) {
    throw new Error('计划里没有有效的块目标。请换个说法，或先引用一段文字。')
  }

  const limited = plannedMode === 'rewrite' ? targets : targets.slice(0, MAX_EDIT_BLOCKS)
  return { mode: plannedMode, summary, targets: limited }
}

export function parseEditPatches(raw: unknown, noteBlocks: Block[], selected: EditTarget[]): EditPatch[] {
  const record = asRecord(raw)
  const list = Array.isArray(record?.patches) ? record.patches : Array.isArray(raw) ? raw : null
  if (!list) throw new Error('结构化模型没有返回可应用的补丁对象。')
  const known = new Set(noteBlocks.map((block) => block.id))
  const allowedIds = new Set(
    selected.filter((item) => item.selected && item.block_id).map((item) => item.block_id as string),
  )
  const allowCreate = selected.some((item) => item.selected && item.action === 'create')
  const patches: EditPatch[] = []

  for (const item of list) {
    const row = asRecord(item)
    if (!row) continue
    const action = parseAction(row.action)
    if (!action) continue
    const blockId = nullableId(row.block_id)
    if (action === 'create') {
      if (selected.length && !allowCreate) continue
    } else if (selected.length && (!blockId || !allowedIds.has(blockId))) {
      continue
    }
    if (action !== 'create' && (!blockId || !known.has(blockId))) continue
    const typeRaw = nullableId(row.type)
    const type = typeRaw && isBlockType(typeRaw)
      ? typeRaw
      : (blockId ? noteBlocks.find((block) => block.id === blockId)?.type : undefined)
    const after = row.after_block_id === null
      ? null
      : nullableId(row.after_block_id)
    let data: BlockDataByType[BlockType] | undefined
    if (action === 'update' || action === 'replace' || action === 'create') {
      if (!type) continue
      data = coerceBlockData(type, row.data)
      const invalid = validateTypedData(type, data)
      if (invalid) throw new Error(invalid)
    }
    patches.push({
      action,
      ...(blockId ? { block_id: blockId } : {}),
      ...(after !== undefined ? { after_block_id: after } : {}),
      ...(type ? { type } : {}),
      ...(data ? { data } : {}),
      intent: asString(row.intent),
    })
  }

  if (!patches.length) throw new Error('没有可应用的改动。')
  return patches.slice(0, Math.max(selected.length, MAX_EDIT_BLOCKS))
}
