import {
  blockRepository,
  createBlock,
  noteRepository,
  workspaceRepository,
  type Block,
  type BlockType,
} from '../../data'
import type { SuiteResult, TestItem } from '../types'
import { allPass, passCount } from '../types'

async function check(name: string, body: () => Promise<string>): Promise<TestItem> {
  try {
    const detail = await body()
    return { name, verdict: 'PASS', detail }
  } catch (error) {
    return {
      name,
      verdict: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

const ORDER: BlockType[] = [
  'text',
  'concept',
  'intuition',
  'math',
  'code',
  'example',
  'exploration',
]

function seedBlock(type: BlockType): Block {
  switch (type) {
    case 'text':
      return createBlock('text', { content: 'plain text' }, { source: 'user' })
    case 'concept':
      return createBlock('concept', { title: 'Attention', content: 'weighted read' }, { source: 'user' })
    case 'intuition':
      return createBlock('intuition', { title: 'Soft lookup', content: 'Q/K/V' }, { source: 'user' })
    case 'math':
      return createBlock('math', { latex: 'QK^T / \\sqrt{d}', explanation: 'scale' }, { source: 'user' })
    case 'code':
      return createBlock('code', { language: 'ts', code: 'softmax(x)' }, { source: 'user' })
    case 'example':
      return createBlock('example', { content: 'pronoun resolution' }, { source: 'user' })
    case 'exploration':
      return createBlock('exploration', { items: ['why scale?', 'multi-head?'] }, { source: 'user' })
  }
}

export async function runBlockSuite(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []

  const ws = await workspaceRepository.createWorkspace(`Block Suite ${Date.now()}`)
  let note = await noteRepository.createNote({ workspaceId: ws.id, title: 'Block Lab' })
  const ids: string[] = []

  items.push(
    await check('创建并添加 7 种 type 的 Block', async () => {
      for (const type of ORDER) {
        const block = seedBlock(type)
        ids.push(block.id)
        note = await blockRepository.add(note.id, block)
      }
      if (note.blocks.length !== 7) throw new Error(`expected 7 got ${note.blocks.length}`)
      const unique = new Set(note.blocks.map((b) => b.id))
      if (unique.size !== 7) throw new Error('duplicate block ids')
      return ORDER.join(', ')
    }),
  )

  items.push(
    await check('查询 Block 列表 / 单条', async () => {
      const list = await blockRepository.getByNoteId(note.id)
      if (list.length !== 7) throw new Error('list length')
      const one = await blockRepository.getById(note.id, ids[2]!)
      if (!one || one.type !== 'intuition') throw new Error('getById miss')
      return `list=${list.length} intuition=${one.id}`
    }),
  )

  items.push(
    await check('type 与 data 匹配', async () => {
      const list = await blockRepository.getByNoteId(note.id)
      for (const block of list) {
        switch (block.type) {
          case 'text':
          case 'example':
            if (!('content' in block.data)) throw new Error(`${block.type} missing content`)
            break
          case 'concept':
          case 'intuition':
            if (!('title' in block.data) || !('content' in block.data)) {
              throw new Error(`${block.type} missing title/content`)
            }
            break
          case 'math':
            if (!('latex' in block.data)) throw new Error('math missing latex')
            break
          case 'code':
            if (!('language' in block.data) || !('code' in block.data)) {
              throw new Error('code missing fields')
            }
            break
          case 'exploration':
            if (!Array.isArray(block.data.items)) throw new Error('exploration items')
            break
        }
      }
      return 'all 7 type/data pairs consistent'
    }),
  )

  items.push(
    await check('修改单个 Block 不影响其他', async () => {
      const before = (await blockRepository.getByNoteId(note.id)).map((b) => ({
        id: b.id,
        updatedAt: b.metadata.updatedAt,
      }))
      const targetId = ids[4]! // code
      const replacement = {
        ...createBlock('code', { language: 'python', code: 'print(1)' }, { source: 'user' }),
        id: targetId,
      }
      note = await blockRepository.update(note.id, replacement)
      const after = await blockRepository.getByNoteId(note.id)
      const updated = after.find((b) => b.id === targetId)
      if (!updated || updated.type !== 'code' || updated.data.code !== 'print(1)') {
        throw new Error('target not updated')
      }
      for (const snap of before) {
        if (snap.id === targetId) continue
        const other = after.find((b) => b.id === snap.id)
        if (!other) throw new Error('sibling lost')
        if (other.metadata.updatedAt !== snap.updatedAt) {
          throw new Error(`sibling ${snap.id} mutated`)
        }
      }
      return `updated ${targetId}; siblings untouched`
    }),
  )

  items.push(
    await check('调整 Block 顺序', async () => {
      const moveId = ids[0]! // text
      note = await blockRepository.move(note.id, moveId, 6)
      if (note.blocks[6]?.id !== moveId) throw new Error('move failed')
      note = await blockRepository.move(note.id, moveId, 0)
      if (note.blocks[0]?.id !== moveId) throw new Error('move back failed')
      return 'moved to end then back to start'
    }),
  )

  items.push(
    await check('删除 Block 后顺序正确', async () => {
      const removeId = ids[1]! // concept
      const beforeIds = note.blocks.map((b) => b.id)
      note = await blockRepository.remove(note.id, removeId)
      if (note.blocks.some((b) => b.id === removeId)) throw new Error('still present')
      const expected = beforeIds.filter((id) => id !== removeId)
      const actual = note.blocks.map((b) => b.id)
      if (expected.join() !== actual.join()) throw new Error('order broken')
      return `remaining=${actual.length}`
    }),
  )

  items.push(
    await check('保存后重新读取 Note', async () => {
      const reloaded = await noteRepository.getById(note.id)
      if (!reloaded) throw new Error('note gone')
      if (reloaded.blocks.length !== note.blocks.length) throw new Error('count mismatch')
      for (let i = 0; i < reloaded.blocks.length; i++) {
        if (reloaded.blocks[i]?.id !== note.blocks[i]?.id) throw new Error(`order at ${i}`)
        if (reloaded.blocks[i]?.type !== note.blocks[i]?.type) throw new Error(`type at ${i}`)
      }
      return `reloaded ${reloaded.blocks.length} blocks intact`
    }),
  )

  try {
    await workspaceRepository.delete(ws.id)
  } catch {
    issues.push('cleanup failed')
  }

  if (!allPass(items)) {
    issues.push(...items.filter((i) => i.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: '4-block',
    title: '4. Block 数据结构与操作测试',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}
