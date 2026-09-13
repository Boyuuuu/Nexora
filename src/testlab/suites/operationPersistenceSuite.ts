/**
 * The end-to-end scenario: a seeded Workspace / Note / Graph, then the ten
 * operations of the stage plan, then a reload to prove IndexedDB holds the
 * result and that nothing dangles.
 */

import {
  closeDatabase,
  createBlock,
  graphRepository,
  noteRepository,
  openDatabase,
  workspaceRepository,
  type Block,
} from '../../data'
import { executeOperation } from '../../operations'
import type { Operation } from '../../operations'
import type { SuiteResult, TestItem } from '../types'
import { allPass, passCount } from '../types'

const FIXTURE_KEY = 'nexora-operation-fixture'

interface OperationFixture {
  workspaceId: string
  noteId: string
  blockIds: string[]
  updatedContent: string
  nodeIds: string[]
  edgeIds: string[]
  position: { x: number; y: number }
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

async function run(operation: Operation): Promise<string[]> {
  const result = await executeOperation(operation)
  if (!result.success) {
    throw new Error(`${operation.operation} failed: ${result.error?.code} — ${result.error?.message}`)
  }
  return result.affectedIds
}

function readFixture(): OperationFixture | null {
  const raw = localStorage.getItem(FIXTURE_KEY)
  return raw ? (JSON.parse(raw) as OperationFixture) : null
}

export function hasOperationFixture(): boolean {
  return localStorage.getItem(FIXTURE_KEY) !== null
}

export function clearOperationFixtureKey(): void {
  localStorage.removeItem(FIXTURE_KEY)
}

function seedBlock(id: string, title: string): Block {
  return { ...createBlock('concept', { title, content: `${title} 的初始内容` }, { source: 'user' }), id }
}

/** Phase A — seed the tree, then run the ten operations in order. */
export async function runOperationScenario(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []
  const updatedContent = `updated-${Date.now()}`
  const position = { x: 320, y: 180 }

  const previous = readFixture()
  if (previous) {
    try {
      await workspaceRepository.delete(previous.workspaceId)
    } catch {
      /* already gone */
    }
    clearOperationFixtureKey()
  }

  const ws = await workspaceRepository.createWorkspace(
    `Operation Scenario ${Date.now()}`,
    'workspace + note + graph for the operation scenario',
  )
  const note = await noteRepository.createNote({
    workspaceId: ws.id,
    title: 'Attention',
    blocks: [seedBlock('block_001', 'B1'), seedBlock('block_002', 'B2'), seedBlock('block_003', 'B3')],
  })
  for (const [id, label, type] of [
    ['node_transformer', 'Transformer', 'architecture'],
    ['node_attention', 'Attention', 'mechanism'],
    ['node_qkv', 'QKV', 'component'],
  ] as const) {
    await graphRepository.addNode(ws.id, { id, label, type, noteId: note.id })
  }

  const wsId = ws.id
  const noteId = note.id

  items.push(
    await check('Seed：Workspace + Note(B1 B2 B3) + Graph(3 nodes)', async () => {
      const stored = await noteRepository.getById(noteId)
      const graph = await graphRepository.getGraph(wsId)
      if (stored?.blocks.length !== 3) throw new Error('seed blocks')
      if (graph.nodes.length !== 3) throw new Error('seed nodes')
      return `${stored.blocks.map((block) => block.id).join(' ')} | ${graph.nodes.map((node) => node.label).join(', ')}`
    }),
  )

  items.push(
    await check('操作 1-4：create / update / move / delete block', async () => {
      await run({
        operation: 'create_block',
        workspace_id: wsId,
        note_id: noteId,
        block: {
          id: 'block_004',
          type: 'math',
          data: { title: 'Scaled dot-product', latex: 'QK^T/\\sqrt{d}' },
          metadata: { source: 'user', tags: ['formula'] },
        },
        after_block_id: 'block_003',
      })
      await run({
        operation: 'update_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_004',
        changes: { data: { explanation: updatedContent } },
      })
      await run({
        operation: 'move_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_004',
        after_block_id: 'block_001',
      })
      await run({
        operation: 'delete_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_002',
      })

      const stored = await noteRepository.getById(noteId)
      const ids = stored!.blocks.map((block) => block.id)
      if (ids.join() !== 'block_001,block_004,block_003') throw new Error(ids.join())
      return ids.join(' ')
    }),
  )

  items.push(
    await check('操作 5-10：node / edge 全流程（含级联）', async () => {
      await run({
        operation: 'create_node',
        workspace_id: wsId,
        node: { id: 'node_ffn', label: 'Feed Forward', type: 'component' },
      })
      await run({
        operation: 'update_node',
        workspace_id: wsId,
        node_id: 'node_attention',
        changes: { label: 'Self Attention', type: 'concept' },
      })
      await run({
        operation: 'move_node',
        workspace_id: wsId,
        node_id: 'node_attention',
        position,
      })
      for (const [id, source, target, type] of [
        ['edge_001', 'node_transformer', 'node_attention', 'contains'],
        ['edge_002', 'node_attention', 'node_qkv', 'uses'],
        ['edge_003', 'node_transformer', 'node_qkv', 'relates'],
      ] as const) {
        await run({
          operation: 'create_edge',
          workspace_id: wsId,
          edge: { id, source, target, type },
        })
      }
      await run({ operation: 'delete_edge', workspace_id: wsId, edge_id: 'edge_001' })
      const affected = await run({
        operation: 'delete_node',
        workspace_id: wsId,
        node_id: 'node_attention',
      })

      if (!affected.includes('edge_002')) {
        throw new Error(`delete_node did not cascade edge_002: ${affected.join(', ')}`)
      }
      const graph = await graphRepository.getGraph(wsId)
      const nodeIds = graph.nodes.map((node) => node.id)
      const edgeIds = graph.edges.map((edge) => edge.id)
      if (nodeIds.join() !== 'node_transformer,node_qkv,node_ffn') throw new Error(nodeIds.join())
      if (edgeIds.join() !== 'edge_003') throw new Error(edgeIds.join())
      return `nodes=[${nodeIds.join(' ')}] edges=[${edgeIds.join(' ')}] cascade=${affected.join(', ')}`
    }),
  )

  items.push(
    await check('记录 Fixture 以便刷新后验证', async () => {
      const stored = await noteRepository.getById(noteId)
      const graph = await graphRepository.getGraph(wsId)
      const fixture: OperationFixture = {
        workspaceId: wsId,
        noteId,
        blockIds: stored!.blocks.map((block) => block.id),
        updatedContent,
        nodeIds: graph.nodes.map((node) => node.id),
        edgeIds: graph.edges.map((edge) => edge.id),
        position,
      }
      localStorage.setItem(FIXTURE_KEY, JSON.stringify(fixture))

      closeDatabase()
      await openDatabase()
      return `ws=${wsId} blocks=${fixture.blockIds.length} nodes=${fixture.nodeIds.length} edges=${fixture.edgeIds.length}`
    }),
  )

  if (!allPass(items)) {
    issues.push(...items.filter((item) => item.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: 'op-2a',
    title: '2A. 完整场景 — 执行 10 个 Operation',
    items,
    summary: `${passCount(items)} PASS · 可刷新页面后点「2B 刷新后重读」`,
    issues,
  }
}

/** Phase B — re-read IndexedDB after a refresh and hunt for orphans. */
export async function verifyOperationScenario(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []
  const fixture = readFixture()

  items.push(
    await check('Fixture 标记存在', async () => {
      if (!fixture) throw new Error('请先运行 2A，再刷新页面跑 2B')
      return fixture.workspaceId
    }),
  )

  if (!fixture) {
    return {
      id: 'op-2b',
      title: '2B. 完整场景 — 刷新后重读',
      items,
      summary: '0/1 PASS',
      issues: ['missing fixture'],
    }
  }

  items.push(
    await check('重新打开 IndexedDB 后 Block 顺序与内容不变', async () => {
      closeDatabase()
      await openDatabase()

      const note = await noteRepository.getById(fixture.noteId)
      if (!note) throw new Error('note lost')
      const ids = note.blocks.map((block) => block.id)
      if (ids.join() !== fixture.blockIds.join()) {
        throw new Error(`${ids.join()} != ${fixture.blockIds.join()}`)
      }
      const patched = note.blocks.find((block) => block.id === 'block_004')
      if (patched?.type !== 'math') throw new Error('block_004 type changed')
      if (patched.data.explanation !== fixture.updatedContent) {
        throw new Error('update_block did not survive the reload')
      }
      if (patched.data.latex !== 'QK^T/\\sqrt{d}') throw new Error('untouched field lost')
      return `${ids.join(' ')}（block_004.explanation 已持久化）`
    }),
  )

  items.push(
    await check('Graph 节点 / 位置 / 边完整', async () => {
      const graph = await graphRepository.getGraph(fixture.workspaceId)
      const nodeIds = graph.nodes.map((node) => node.id)
      const edgeIds = graph.edges.map((edge) => edge.id)
      if (nodeIds.join() !== fixture.nodeIds.join()) throw new Error(nodeIds.join())
      if (edgeIds.join() !== fixture.edgeIds.join()) throw new Error(edgeIds.join())
      if (graph.nodes.some((node) => node.id === 'node_attention')) {
        throw new Error('deleted node came back')
      }
      const ffn = graph.nodes.find((node) => node.id === 'node_ffn')
      if (!ffn) throw new Error('node_ffn lost')
      return `nodes=[${nodeIds.join(' ')}] edges=[${edgeIds.join(' ')}]`
    }),
  )

  items.push(
    await check('move_node 的 position 持久化', async () => {
      // The moved node was deleted in step 10, so re-place a surviving node and reload.
      const result = await executeOperation({
        operation: 'move_node',
        workspace_id: fixture.workspaceId,
        node_id: 'node_qkv',
        position: fixture.position,
      })
      if (!result.success) throw new Error(result.error?.message ?? 'move_node failed')

      closeDatabase()
      await openDatabase()
      const graph = await graphRepository.getGraph(fixture.workspaceId)
      const node = graph.nodes.find((candidate) => candidate.id === 'node_qkv')
      if (node?.position?.x !== fixture.position.x || node.position.y !== fixture.position.y) {
        throw new Error(JSON.stringify(node?.position))
      }
      return `node_qkv.position=(${node.position.x}, ${node.position.y})`
    }),
  )

  items.push(
    await check('无孤儿引用', async () => {
      const workspace = await workspaceRepository.getById(fixture.workspaceId)
      if (!workspace) throw new Error('workspace lost')
      const notes = await noteRepository.getByWorkspaceId(fixture.workspaceId)
      const noteIds = new Set(notes.map((note) => note.id))
      const nodeIds = new Set(workspace.graph.nodes.map((node) => node.id))

      for (const edge of workspace.graph.edges) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          throw new Error(`edge ${edge.id} points at a missing node`)
        }
      }
      for (const node of workspace.graph.nodes) {
        if (node.noteId !== undefined && !noteIds.has(node.noteId)) {
          throw new Error(`node ${node.id} points at a missing note`)
        }
      }
      if (workspace.noteIds.length !== notes.length) {
        throw new Error(`workspace.noteIds=${workspace.noteIds.length} but notes=${notes.length}`)
      }
      const blockIds = notes.flatMap((note) => note.blocks.map((block) => block.id))
      if (new Set(blockIds).size !== blockIds.length) throw new Error('duplicate block ids')
      return `edges=${workspace.graph.edges.length} nodes=${nodeIds.size} notes=${notes.length} blocks=${blockIds.length}`
    }),
  )

  if (!allPass(items)) {
    issues.push(...items.filter((item) => item.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: 'op-2b',
    title: '2B. 完整场景 — 刷新后重读',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}

export async function cleanupOperationFixture(): Promise<string> {
  const fixture = readFixture()
  if (!fixture) return '无 fixture'
  try {
    await workspaceRepository.delete(fixture.workspaceId)
  } catch {
    /* already gone */
  }
  clearOperationFixtureKey()
  return `已删除 ${fixture.workspaceId}`
}
