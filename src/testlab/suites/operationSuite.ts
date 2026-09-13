import { noteRepository, workspaceRepository } from '../../data'
import { executeOperation } from '../../operations'
import type { Operation, OperationErrorCode, OperationResult } from '../../operations'
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

/** Runs an operation that is expected to succeed. */
async function run(operation: Operation): Promise<OperationResult> {
  const result = await executeOperation(operation)
  if (!result.success) {
    throw new Error(`${operation.operation} failed: ${result.error?.code} — ${result.error?.message}`)
  }
  return result
}

/** Runs an operation that must be rejected with exactly `code`. */
async function reject(operation: Operation, code: OperationErrorCode): Promise<string> {
  const result = await executeOperation(operation)
  if (result.success || !result.error) {
    throw new Error(`${operation.operation} unexpectedly succeeded`)
  }
  if (result.error.code !== code) {
    throw new Error(`expected ${code}, got ${result.error.code} — ${result.error.message}`)
  }
  if (result.affectedIds.length !== 0) {
    throw new Error(`rejected operation reported affectedIds: ${result.affectedIds.join(', ')}`)
  }
  return result.error.message
}

/** Malformed payloads are the point of the error checks, so the union is bypassed on purpose. */
function malformed(operation: unknown): Operation {
  return operation as Operation
}

async function blockIds(noteId: string): Promise<string[]> {
  const note = await noteRepository.getById(noteId)
  if (!note) throw new Error(`note vanished: ${noteId}`)
  return note.blocks.map((block) => block.id)
}

/** Blocks + graph only: workspace metadata carries an `updatedAt` that moves on every save. */
async function snapshot(workspaceId: string, noteId: string): Promise<string> {
  const workspace = await workspaceRepository.getById(workspaceId)
  const note = await noteRepository.getById(noteId)
  return JSON.stringify({ graph: workspace?.graph, blocks: note?.blocks })
}

export async function runOperationSuite(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []

  const ws = await workspaceRepository.createWorkspace(`Operation Suite ${Date.now()}`)
  const note = await noteRepository.createNote({ workspaceId: ws.id, title: 'Operation Lab' })
  const wsId = ws.id
  const noteId = note.id

  // ---------- Block operations ----------

  items.push(
    await check('create_block 默认追加到末尾', async () => {
      for (const [id, title] of [
        ['block_001', 'B1'],
        ['block_002', 'B2'],
        ['block_003', 'B3'],
      ] as const) {
        const result = await run({
          operation: 'create_block',
          workspace_id: wsId,
          note_id: noteId,
          block: { id, type: 'concept', data: { title, content: `${title} content` } },
        })
        if (result.affectedIds.join() !== id) throw new Error(`affectedIds=${result.affectedIds}`)
      }
      const ids = await blockIds(noteId)
      if (ids.join() !== 'block_001,block_002,block_003') throw new Error(ids.join())
      return ids.join(' ')
    }),
  )

  items.push(
    await check('create_block after_block_id 插入指定位置', async () => {
      await run({
        operation: 'create_block',
        workspace_id: wsId,
        note_id: noteId,
        block: { id: 'block_mid', type: 'text', data: { content: 'inserted' } },
        after_block_id: 'block_001',
      })
      const ids = await blockIds(noteId)
      if (ids.join() !== 'block_001,block_mid,block_002,block_003') throw new Error(ids.join())
      return ids.join(' ')
    }),
  )

  items.push(
    await check('create_block after_block_id=null 插入最前', async () => {
      await run({
        operation: 'create_block',
        workspace_id: wsId,
        note_id: noteId,
        block: { id: 'block_head', type: 'text', data: { content: 'head' } },
        after_block_id: null,
      })
      const ids = await blockIds(noteId)
      if (ids[0] !== 'block_head') throw new Error(ids.join())
      return ids.join(' ')
    }),
  )

  items.push(
    await check('update_block 只改指定字段', async () => {
      const before = await noteRepository.getById(noteId)
      const beforeTarget = before!.blocks.find((block) => block.id === 'block_002')!
      const beforeSiblings = before!.blocks
        .filter((block) => block.id !== 'block_002')
        .map((block) => block.metadata.updatedAt)
        .join()

      await run({
        operation: 'update_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_002',
        changes: { data: { content: '新的内容' }, metadata: { tags: ['edited'] } },
      })

      const after = await noteRepository.getById(noteId)
      const target = after!.blocks.find((block) => block.id === 'block_002')
      if (!target || target.type !== 'concept') throw new Error('block type changed')
      if (target.data.content !== '新的内容') throw new Error('content not updated')
      if (target.data.title !== beforeTarget.data.title) throw new Error('untouched title changed')
      if (target.metadata.tags?.join() !== 'edited') throw new Error('metadata not merged')
      if (target.metadata.createdAt !== beforeTarget.metadata.createdAt) {
        throw new Error('createdAt was rewritten')
      }
      const afterSiblings = after!.blocks
        .filter((block) => block.id !== 'block_002')
        .map((block) => block.metadata.updatedAt)
        .join()
      if (afterSiblings !== beforeSiblings) throw new Error('siblings were touched')
      return 'content + tags updated; title / createdAt / siblings intact'
    }),
  )

  items.push(
    await check('move_block：B1 B2 B3 → B1 B3 B2', async () => {
      // Trim back to exactly B1 B2 B3 first.
      for (const id of ['block_head', 'block_mid']) {
        await run({
          operation: 'delete_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: id,
        })
      }
      const start = await blockIds(noteId)
      if (start.join() !== 'block_001,block_002,block_003') throw new Error(start.join())

      await run({
        operation: 'move_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_003',
        after_block_id: 'block_001',
      })
      const moved = await blockIds(noteId)
      if (moved.join() !== 'block_001,block_003,block_002') throw new Error(moved.join())
      return `${start.join(' ')} → ${moved.join(' ')}`
    }),
  )

  items.push(
    await check('move_block after_block_id=null 移到最前', async () => {
      await run({
        operation: 'move_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_002',
        after_block_id: null,
      })
      const ids = await blockIds(noteId)
      if (ids.join() !== 'block_002,block_001,block_003') throw new Error(ids.join())
      return ids.join(' ')
    }),
  )

  items.push(
    await check('delete_block 后顺序保持', async () => {
      const result = await run({
        operation: 'delete_block',
        workspace_id: wsId,
        note_id: noteId,
        block_id: 'block_001',
      })
      if (result.affectedIds.join() !== 'block_001') throw new Error('affectedIds')
      const ids = await blockIds(noteId)
      if (ids.join() !== 'block_002,block_003') throw new Error(ids.join())
      return ids.join(' ')
    }),
  )

  // ---------- Graph operations ----------

  items.push(
    await check('create_node ×3（含 note_id 引用）', async () => {
      await run({
        operation: 'create_node',
        workspace_id: wsId,
        node: { id: 'node_transformer', label: 'Transformer', type: 'architecture' },
      })
      await run({
        operation: 'create_node',
        workspace_id: wsId,
        node: {
          id: 'node_attention',
          label: 'Attention',
          type: 'mechanism',
          note_id: noteId,
        },
      })
      await run({
        operation: 'create_node',
        workspace_id: wsId,
        node: { id: 'node_qkv', label: 'QKV', type: 'component' },
      })

      const workspace = await workspaceRepository.getById(wsId)
      const nodes = workspace!.graph.nodes
      if (nodes.length !== 3) throw new Error(`nodes=${nodes.length}`)
      const attention = nodes.find((node) => node.id === 'node_attention')
      if (attention?.noteId !== noteId) throw new Error('note_id not linked')
      if (nodes.some((node) => node.workspaceId !== wsId)) throw new Error('workspaceId mismatch')
      return nodes.map((node) => node.label).join(', ')
    }),
  )

  items.push(
    await check('update_node 改 label / type / note_id', async () => {
      await run({
        operation: 'update_node',
        workspace_id: wsId,
        node_id: 'node_attention',
        changes: { label: 'Self Attention', type: 'concept', note_id: null },
      })
      const workspace = await workspaceRepository.getById(wsId)
      const node = workspace!.graph.nodes.find((candidate) => candidate.id === 'node_attention')
      if (node?.label !== 'Self Attention') throw new Error('label')
      if (node.type !== 'concept') throw new Error('type')
      if (node.noteId !== undefined) throw new Error('note_id not detached')
      return `${node.label} / ${node.type} / note detached`
    }),
  )

  items.push(
    await check('move_node 写入 position', async () => {
      await run({
        operation: 'move_node',
        workspace_id: wsId,
        node_id: 'node_attention',
        position: { x: 320, y: 180 },
      })
      const workspace = await workspaceRepository.getById(wsId)
      const node = workspace!.graph.nodes.find((candidate) => candidate.id === 'node_attention')
      if (node?.position?.x !== 320 || node.position.y !== 180) {
        throw new Error(JSON.stringify(node?.position))
      }
      if (node.label !== 'Self Attention') throw new Error('move_node changed other fields')
      return `position=(${node.position.x}, ${node.position.y})`
    }),
  )

  items.push(
    await check('create_edge ×2', async () => {
      await run({
        operation: 'create_edge',
        workspace_id: wsId,
        edge: {
          id: 'edge_001',
          source: 'node_transformer',
          target: 'node_attention',
          type: 'contains',
        },
      })
      await run({
        operation: 'create_edge',
        workspace_id: wsId,
        edge: { id: 'edge_002', source: 'node_attention', target: 'node_qkv', type: 'uses' },
      })
      const workspace = await workspaceRepository.getById(wsId)
      const edges = workspace!.graph.edges
      if (edges.length !== 2) throw new Error(`edges=${edges.length}`)
      return edges.map((edge) => `${edge.source}--${edge.type}->${edge.target}`).join(' , ')
    }),
  )

  items.push(
    await check('delete_edge', async () => {
      const result = await run({
        operation: 'delete_edge',
        workspace_id: wsId,
        edge_id: 'edge_001',
      })
      if (result.affectedIds.join() !== 'edge_001') throw new Error('affectedIds')
      const workspace = await workspaceRepository.getById(wsId)
      if (workspace!.graph.edges.some((edge) => edge.id === 'edge_001')) {
        throw new Error('edge remains')
      }
      return `edges=${workspace!.graph.edges.length}`
    }),
  )

  items.push(
    await check('delete_node 级联删除相关 Edge（无孤儿）', async () => {
      const result = await run({
        operation: 'delete_node',
        workspace_id: wsId,
        node_id: 'node_attention',
      })
      if (!result.affectedIds.includes('node_attention')) throw new Error('node id missing')
      if (!result.affectedIds.includes('edge_002')) {
        throw new Error(`cascaded edge not reported: ${result.affectedIds.join(', ')}`)
      }

      const workspace = await workspaceRepository.getById(wsId)
      const graph = workspace!.graph
      if (graph.nodes.some((node) => node.id === 'node_attention')) throw new Error('node remains')
      const nodeIds = new Set(graph.nodes.map((node) => node.id))
      for (const edge of graph.edges) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          throw new Error(`orphan edge ${edge.id}`)
        }
      }
      return `affectedIds=${result.affectedIds.join(', ')}; edges=${graph.edges.length}`
    }),
  )

  // ---------- Error scenarios ----------

  const before = await snapshot(wsId, noteId)

  items.push(
    await check('不存在的 Workspace / Note → PARENT_NOT_FOUND', async () => {
      const a = await reject(
        {
          operation: 'create_block',
          workspace_id: 'ws_missing',
          note_id: noteId,
          block: { id: 'block_x', type: 'text', data: { content: 'x' } },
        },
        'PARENT_NOT_FOUND',
      )
      const b = await reject(
        {
          operation: 'delete_block',
          workspace_id: wsId,
          note_id: 'note_missing',
          block_id: 'block_002',
        },
        'PARENT_NOT_FOUND',
      )
      return `${a} / ${b}`
    }),
  )

  items.push(
    await check('不存在的 Block / Node / Edge → TARGET_NOT_FOUND', async () => {
      const a = await reject(
        {
          operation: 'update_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_missing',
          changes: { data: { content: 'x' } },
        },
        'TARGET_NOT_FOUND',
      )
      const b = await reject(
        { operation: 'move_node', workspace_id: wsId, node_id: 'node_missing', position: { x: 0, y: 0 } },
        'TARGET_NOT_FOUND',
      )
      const c = await reject(
        { operation: 'delete_edge', workspace_id: wsId, edge_id: 'edge_missing' },
        'TARGET_NOT_FOUND',
      )
      return `${a} / ${b} / ${c}`
    }),
  )

  items.push(
    await check('重复 Block / Node / Edge ID → DUPLICATE_ID', async () => {
      const a = await reject(
        {
          operation: 'create_block',
          workspace_id: wsId,
          note_id: noteId,
          block: { id: 'block_002', type: 'text', data: { content: 'dup' } },
        },
        'DUPLICATE_ID',
      )
      const b = await reject(
        {
          operation: 'create_node',
          workspace_id: wsId,
          node: { id: 'node_qkv', label: 'QKV again', type: 'concept' },
        },
        'DUPLICATE_ID',
      )
      await run({
        operation: 'create_edge',
        workspace_id: wsId,
        edge: { id: 'edge_keep', source: 'node_transformer', target: 'node_qkv', type: 'relates' },
      })
      const c = await reject(
        {
          operation: 'create_edge',
          workspace_id: wsId,
          edge: {
            id: 'edge_keep',
            source: 'node_qkv',
            target: 'node_transformer',
            type: 'relates',
          },
        },
        'DUPLICATE_ID',
      )
      await run({ operation: 'delete_edge', workspace_id: wsId, edge_id: 'edge_keep' })
      return `${a} / ${b} / ${c}`
    }),
  )

  items.push(
    await check('无效 Block Type / Block Data', async () => {
      const a = await reject(
        malformed({
          operation: 'create_block',
          workspace_id: wsId,
          note_id: noteId,
          block: { id: 'block_bad', type: 'diagram', data: { content: 'x' } },
        }),
        'INVALID_BLOCK_TYPE',
      )
      const b = await reject(
        malformed({
          operation: 'create_block',
          workspace_id: wsId,
          note_id: noteId,
          block: { id: 'block_bad', type: 'concept', data: { content: 'no title' } },
        }),
        'INVALID_BLOCK_DATA',
      )
      const c = await reject(
        {
          operation: 'update_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_002',
          changes: { data: { latex: 'x^2' } },
        },
        'INVALID_BLOCK_DATA',
      )
      const d = await reject(
        {
          operation: 'update_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_002',
          changes: { data: { content: '' } },
        },
        'INVALID_BLOCK_DATA',
      )
      return `type / missing title / wrong field / empty content：${[a, b, c, d].length} 项均被拒`
    }),
  )

  items.push(
    await check('无效 Edge 引用与 self-loop → INVALID_REFERENCE', async () => {
      const a = await reject(
        {
          operation: 'create_edge',
          workspace_id: wsId,
          edge: { id: 'edge_bad', source: 'node_transformer', target: 'node_ghost', type: 'uses' },
        },
        'INVALID_REFERENCE',
      )
      const b = await reject(
        {
          operation: 'create_edge',
          workspace_id: wsId,
          edge: { id: 'edge_bad', source: 'node_qkv', target: 'node_qkv', type: 'relates' },
        },
        'INVALID_REFERENCE',
      )
      const c = await reject(
        {
          operation: 'create_node',
          workspace_id: wsId,
          node: { id: 'node_ref', label: 'Bad ref', type: 'topic', note_id: 'note_ghost' },
        },
        'INVALID_REFERENCE',
      )
      return `${a} / ${b} / ${c}`
    }),
  )

  items.push(
    await check('禁止通过 changes 修改 id / type → INVALID_OPERATION', async () => {
      const a = await reject(
        malformed({
          operation: 'update_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_002',
          changes: { id: 'block_renamed' },
        }),
        'INVALID_OPERATION',
      )
      const b = await reject(
        malformed({
          operation: 'update_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_002',
          changes: { type: 'text' },
        }),
        'INVALID_OPERATION',
      )
      const c = await reject(
        malformed({
          operation: 'update_node',
          workspace_id: wsId,
          node_id: 'node_qkv',
          changes: { id: 'node_renamed' },
        }),
        'INVALID_OPERATION',
      )
      const d = await reject(
        malformed({
          operation: 'update_node',
          workspace_id: wsId,
          node_id: 'node_qkv',
          changes: { position: { x: 1, y: 1 } },
        }),
        'INVALID_OPERATION',
      )
      return `block.id / block.type / node.id / node.position 均被拒（${[a, b, c, d].length}）`
    }),
  )

  items.push(
    await check('无效定位 → INVALID_POSITION', async () => {
      const a = await reject(
        {
          operation: 'move_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_002',
          after_block_id: 'block_ghost',
        },
        'INVALID_POSITION',
      )
      const b = await reject(
        {
          operation: 'move_block',
          workspace_id: wsId,
          note_id: noteId,
          block_id: 'block_002',
          after_block_id: 'block_002',
        },
        'INVALID_POSITION',
      )
      const c = await reject(
        malformed({
          operation: 'move_node',
          workspace_id: wsId,
          node_id: 'node_qkv',
          position: { x: 'left', y: 0 },
        }),
        'INVALID_POSITION',
      )
      return `${a} / ${b} / ${c}`
    }),
  )

  items.push(
    await check('未知 operation → INVALID_OPERATION', async () => {
      return reject(
        malformed({ operation: 'rename_block', workspace_id: wsId, note_id: noteId }),
        'INVALID_OPERATION',
      )
    }),
  )

  items.push(
    await check('错误 Operation 未修改任何数据', async () => {
      const after = await snapshot(wsId, noteId)
      if (after !== before) throw new Error('data changed while operations were failing')
      return `blocks + graph 与错误场景前完全一致（${after.length} chars）`
    }),
  )

  try {
    await workspaceRepository.delete(wsId)
  } catch {
    issues.push('cleanup failed')
  }

  if (!allPass(items)) {
    issues.push(...items.filter((item) => item.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: 'op-1',
    title: '1. Operation Engine — Block / Graph / 错误场景',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}
