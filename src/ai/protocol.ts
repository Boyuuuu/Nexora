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
      return { title, content: asString(record.content) }
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

/** Treat model output as untrusted: reject the whole batch instead of skipping bad rows. */
export function parseEditPatches(raw: unknown, noteBlocks: Block[], selected?: EditTarget[]): EditPatch[] {
  const record = asRecord(raw)
  if (!record || !Array.isArray(record.patches) || Object.keys(record).some((key) => key !== 'patches')) {
    throw new Error('整理结果不是有效的 patches 对象。')
  }
  if (record.patches.length > 32) throw new Error('整理改动超过 32 项，请缩小范围。')
  const known = new Map(noteBlocks.map((block) => [block.id, block]))
  const live = new Set(known.keys())
  const touched = new Set<string>()
  const remaining = selected?.filter((target) => target.selected).slice()
  const patches: EditPatch[] = []
  for (const item of record.patches) {
    const row = asRecord(item)
    if (!row || Object.keys(row).some((key) => !['action', 'block_id', 'after_block_id', 'type', 'intent', 'data'].includes(key))) throw new Error('改动包含未知字段。')
    const action = parseAction(row.action)
    if (!action) throw new Error('未知的 Block 操作。')
    for (const key of ['block_id', 'after_block_id', 'type', 'intent']) {
      if (row[key] != null && typeof row[key] !== 'string') throw new Error(`无效字段：${key}`)
    }
    const blockId = nullableId(row.block_id)
    if (action === 'create' && blockId) throw new Error('新增 Block 的 ID 由程序生成。')
    if (action !== 'create' && (!blockId || !live.has(blockId) || touched.has(blockId))) throw new Error('目标 Block 不存在或被重复修改。')
    if (remaining) {
      const match = remaining.findIndex((target) => target.action === action && target.block_id === blockId)
      if (match < 0) throw new Error('改动不符合已选择的操作。')
      remaining.splice(match, 1)
    }
    const existing = blockId ? known.get(blockId) : undefined
    const type = row.type == null ? existing?.type : row.type
    if (type !== undefined && !isBlockType(type)) throw new Error('未知的 Block 类型。')
    if (action === 'update' && type !== existing?.type) throw new Error('转换类型必须使用 replace。')
    const after = row.after_block_id === null ? null : nullableId(row.after_block_id)
    if (action === 'create' || action === 'move') {
      if (after && (!live.has(after) || after === blockId)) throw new Error('目标位置无效。')
      if (action === 'move' && after === undefined) throw new Error('移动缺少目标位置。')
    } else if (after !== undefined && after !== null) throw new Error('此操作不支持移动位置。')
    let data: EditPatch['data']
    if (action === 'create' || action === 'update' || action === 'replace') {
      const source = asRecord(row.data)
      if (!source || !type) throw new Error('改动缺少 Block 内容。')
      const fields = BLOCK_DATA_FIELDS[type] as readonly string[]
      const allFields = new Set<string>(Object.values(BLOCK_DATA_FIELDS).flat())
      for (const [key, value] of Object.entries(source)) {
        if (!allFields.has(key)) throw new Error(`未知内容字段：${key}`)
        if (!fields.includes(key) && value !== '' && !(Array.isArray(value) && !value.length)) throw new Error(`${type} 不支持字段 ${key}`)
        if (key === 'items' ? !Array.isArray(value) || value.some((v) => typeof v !== 'string') : typeof value !== 'string') throw new Error(`无效内容字段：${key}`)
      }
      const primary = type === 'math' ? 'latex' : type === 'code' ? 'code' : type === 'exploration' ? 'items' : 'content'
      const body = source[primary]
      if (primary === 'items' ? !Array.isArray(body) || !body.length || body.some((v) => !v.trim()) : typeof body !== 'string' || !body.trim()) throw new Error('不能用空内容覆盖 Block。')
      const merged: Record<string, unknown> = action === 'update' ? { ...existing!.data } : {}
      for (const field of fields) if (source[field] !== undefined) merged[field] = source[field]
      data = coerceBlockData(type, merged)
      const invalid = validateTypedData(type, data)
      if (invalid) throw new Error(invalid)
    } else if (row.data != null) throw new Error('删除和移动不应包含内容。')
    patches.push({ action, ...(blockId ? { block_id: blockId } : {}), ...(after !== undefined ? { after_block_id: after } : {}), ...(type ? { type } : {}), ...(data ? { data } : {}), intent: asString(row.intent) })
    if (blockId) touched.add(blockId)
    if (action === 'delete') live.delete(blockId!)
  }
  return patches
}
