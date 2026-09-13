import {
  assetRepository,
  blockRepository,
  closeDatabase,
  conversationRepository,
  createBlock,
  createMessage,
  graphRepository,
  noteRepository,
  openDatabase,
  workspaceRepository,
} from '../../data'
import type { FinalScorecard, SuiteResult, TestItem } from '../types'
import { allPass, passCount } from '../types'

const PERSIST_KEY = 'nexora-testlab-persist-ids'

interface PersistFixture {
  workspaceId: string
  noteId: string
  nodeIds: string[]
  edgeIds: string[]
  conversationId: string
  assetId: string
  blockIds: string[]
  assetText: string
}

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

function readFixture(): PersistFixture | null {
  const raw = localStorage.getItem(PERSIST_KEY)
  if (!raw) return null
  return JSON.parse(raw) as PersistFixture
}

function writeFixture(fixture: PersistFixture): void {
  localStorage.setItem(PERSIST_KEY, JSON.stringify(fixture))
}

export function clearPersistFixture(): void {
  localStorage.removeItem(PERSIST_KEY)
}

export function hasPersistFixture(): boolean {
  return localStorage.getItem(PERSIST_KEY) !== null
}

/** Phase A: write a full workspace tree and remember ids for post-reload checks. */
export async function seedPersistenceFixture(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []

  items.push(
    await check('写入完整 Workspace 树', async () => {
      // Clear previous fixture workspace if any
      const prev = readFixture()
      if (prev) {
        try {
          await workspaceRepository.delete(prev.workspaceId)
        } catch {
          /* already gone */
        }
        clearPersistFixture()
      }

      const ws = await workspaceRepository.createWorkspace(
        `Persist Fixture ${Date.now()}`,
        'full tree for reload test',
      )

      const note = await noteRepository.createNote({
        workspaceId: ws.id,
        title: 'Persistence Note',
        blocks: [
          createBlock('concept', { title: 'A', content: 'alpha' }, { source: 'user' }),
          createBlock('math', { latex: 'x^2' }, { source: 'user' }),
          createBlock('code', { language: 'ts', code: '1+1' }, { source: 'user' }),
        ],
      })

      // Extra block via repository path
      const extra = createBlock('text', { content: 'extra' }, { source: 'user' })
      await blockRepository.add(note.id, extra)

      const n1 = await graphRepository.addNode(ws.id, {
        label: 'Root',
        type: 'architecture',
      })
      const n2 = await graphRepository.addNode(ws.id, {
        label: 'Child',
        type: 'mechanism',
        noteId: note.id,
      })
      const e1 = await graphRepository.addEdge(ws.id, {
        source: n1.id,
        target: n2.id,
        type: 'contains',
      })

      const conv = await conversationRepository.createConversation({
        workspaceId: ws.id,
        title: 'Persist Chat',
        messages: [
          createMessage('user', 'hello'),
          createMessage('assistant', 'hi'),
        ],
      })

      const assetText = `persist-${Date.now()}`
      const asset = await assetRepository.createAsset({
        workspaceId: ws.id,
        name: 'persist.bin',
        type: 'file',
        data: new Blob([assetText], { type: 'text/plain' }),
      })

      const reloadedNote = await noteRepository.getById(note.id)
      if (!reloadedNote) throw new Error('note missing after write')

      const fixture: PersistFixture = {
        workspaceId: ws.id,
        noteId: note.id,
        nodeIds: [n1.id, n2.id],
        edgeIds: [e1.id],
        conversationId: conv.id,
        assetId: asset.id,
        blockIds: reloadedNote.blocks.map((b) => b.id),
        assetText,
      }
      writeFixture(fixture)

      // Simulate app re-init without full browser reload
      closeDatabase()
      await openDatabase()

      return `ws=${ws.id} blocks=${fixture.blockIds.length} nodes=2 edges=1`
    }),
  )

  if (!allPass(items)) {
    issues.push(...items.filter((i) => i.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: '6a-seed',
    title: '6A. 持久化 — 写入完整树',
    items,
    summary: `${passCount(items)} PASS · 可刷新页面后点「6B 重读验证」`,
    issues,
  }
}

/** Phase B: after refresh / re-init, verify everything still matches. */
export async function verifyPersistenceFixture(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []
  const fixture = readFixture()

  items.push(
    await check('Fixture 标记存在', async () => {
      if (!fixture) throw new Error('请先运行 6A 写入，再刷新或不刷新直接跑 6B')
      return fixture.workspaceId
    }),
  )

  if (!fixture) {
    return {
      id: '6b-reload',
      title: '6B. 持久化 — 重读验证',
      items,
      summary: '0/1 PASS',
      issues: ['missing fixture'],
    }
  }

  items.push(
    await check('重新读取 Workspace', async () => {
      closeDatabase()
      await openDatabase()
      const ws = await workspaceRepository.getById(fixture.workspaceId)
      if (!ws) throw new Error('workspace lost')
      if (!ws.noteIds.includes(fixture.noteId)) throw new Error('noteIds broken')
      if (!ws.conversationIds.includes(fixture.conversationId)) {
        throw new Error('conversationIds broken')
      }
      if (!ws.assetIds.includes(fixture.assetId)) throw new Error('assetIds broken')
      return `refs ok`
    }),
  )

  items.push(
    await check('Notes + Blocks 完整', async () => {
      const note = await noteRepository.getById(fixture.noteId)
      if (!note) throw new Error('note lost')
      if (note.blocks.length !== fixture.blockIds.length) {
        throw new Error(`blocks ${note.blocks.length} != ${fixture.blockIds.length}`)
      }
      const ids = note.blocks.map((b) => b.id)
      if (ids.join() !== fixture.blockIds.join()) throw new Error('block order/id changed')
      const unique = new Set(ids)
      if (unique.size !== ids.length) throw new Error('duplicate block ids')
      return `blocks=${ids.length}`
    }),
  )

  items.push(
    await check('Graph Nodes / Edges 引用有效', async () => {
      const graph = await graphRepository.getGraph(fixture.workspaceId)
      if (graph.nodes.length !== 2) throw new Error(`nodes=${graph.nodes.length}`)
      if (graph.edges.length !== 1) throw new Error(`edges=${graph.edges.length}`)
      const nodeSet = new Set(graph.nodes.map((n) => n.id))
      for (const id of fixture.nodeIds) {
        if (!nodeSet.has(id)) throw new Error(`missing node ${id}`)
      }
      for (const edge of graph.edges) {
        if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) {
          throw new Error('invalid edge ref')
        }
      }
      return 'nodes/edges consistent'
    }),
  )

  items.push(
    await check('Conversation 仍在', async () => {
      const conv = await conversationRepository.getById(fixture.conversationId)
      if (!conv) throw new Error('conversation lost')
      if (conv.messages.length < 2) throw new Error('messages lost')
      return `messages=${conv.messages.length}`
    }),
  )

  items.push(
    await check('Asset Blob 仍可读', async () => {
      const asset = await assetRepository.getById(fixture.assetId)
      if (!asset) throw new Error('asset lost')
      if (!(asset.data instanceof Blob)) throw new Error('not Blob')
      const text = await asset.data.text()
      if (text !== fixture.assetText) throw new Error('blob content changed')
      return `${asset.size}B ok`
    }),
  )

  items.push(
    await check('无孤儿 / 无重复 Workspace 引用', async () => {
      const ws = await workspaceRepository.getById(fixture.workspaceId)
      if (!ws) throw new Error('ws gone')
      const notes = await noteRepository.getByWorkspaceId(fixture.workspaceId)
      const convs = await conversationRepository.getByWorkspaceId(fixture.workspaceId)
      const assets = await assetRepository.getByWorkspaceId(fixture.workspaceId)
      if (notes.length !== ws.noteIds.length) throw new Error('note orphan/mismatch')
      if (convs.length !== ws.conversationIds.length) throw new Error('conv mismatch')
      if (assets.length !== ws.assetIds.length) throw new Error('asset mismatch')
      if (new Set(ws.noteIds).size !== ws.noteIds.length) throw new Error('dup noteIds')
      return 'no orphans detected'
    }),
  )

  if (!allPass(items)) {
    issues.push(...items.filter((i) => i.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: '6b-reload',
    title: '6B. 持久化 — 重读验证',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}

export async function cleanupPersistenceFixture(): Promise<string> {
  const fixture = readFixture()
  if (!fixture) return '无 fixture'
  try {
    await workspaceRepository.delete(fixture.workspaceId)
  } catch {
    /* ignore */
  }
  clearPersistFixture()
  return `已删除 ${fixture.workspaceId}`
}

export function buildScorecard(input: {
  typeOk: boolean
  idbOk: boolean
  workspaceNote: SuiteResult | null
  block: SuiteResult | null
  gca: SuiteResult | null
  persistSeed: SuiteResult | null
  persistVerify: SuiteResult | null
  transfer: SuiteResult | null
}): FinalScorecard {
  const suiteOk = (s: SuiteResult | null) => !!s && allPass(s.items)
  return {
    dataModel: input.typeOk ? 'PASS' : 'FAIL',
    indexedDb: input.idbOk ? 'PASS' : 'FAIL',
    workspace: suiteOk(input.workspaceNote) ? 'PASS' : 'FAIL',
    note: suiteOk(input.workspaceNote) ? 'PASS' : 'FAIL',
    block: suiteOk(input.block) ? 'PASS' : 'FAIL',
    graph: suiteOk(input.gca) ? 'PASS' : 'FAIL',
    conversation: suiteOk(input.gca) ? 'PASS' : 'FAIL',
    asset: suiteOk(input.gca) ? 'PASS' : 'FAIL',
    persistence:
      suiteOk(input.persistSeed) && suiteOk(input.persistVerify) ? 'PASS' : 'FAIL',
    transfer: suiteOk(input.transfer) ? 'PASS' : 'FAIL',
  }
}
