import {
  assetRepository,
  blockRepository,
  conversationRepository,
  createBlock,
  createMessage,
  describeSnapshot,
  exportBackupSnapshot,
  exportNoteSnapshot,
  exportWorkspaceSnapshot,
  graphRepository,
  importSnapshot,
  noteRepository,
  readSnapshotBlob,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  SnapshotError,
  snapshotToBlob,
  workspaceRepository,
  type Snapshot,
  type SnapshotErrorCode,
  type WorkspaceSnapshot,
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

interface Fixture {
  workspaceId: string
  noteId: string
  blockIds: string[]
  nodeIds: string[]
  edgeId: string
  conversationId: string
  assetId: string
  assetText: string
}

const ASSET_TEXT = 'nexora-transfer-asset'

async function seedFixture(label: string): Promise<Fixture> {
  const ws = await workspaceRepository.createWorkspace(label, 'transfer fixture')
  const note = await noteRepository.createNote({
    workspaceId: ws.id,
    title: 'Attention',
    blocks: [
      createBlock('concept', { title: 'B1', content: 'alpha' }, { source: 'user' }),
      createBlock('math', { latex: 'QK^T' }, { source: 'user' }),
      createBlock('text', { content: 'gamma' }, { source: 'user', tags: ['note'] }),
    ],
  })

  const transformer = await graphRepository.addNode(ws.id, {
    label: 'Transformer',
    type: 'architecture',
  })
  const attention = await graphRepository.addNode(ws.id, {
    label: 'Attention',
    type: 'mechanism',
    noteId: note.id,
    position: { x: 120, y: 240 },
  })
  const edge = await graphRepository.addEdge(ws.id, {
    source: transformer.id,
    target: attention.id,
    type: 'contains',
  })

  const conversation = await conversationRepository.createConversation({
    workspaceId: ws.id,
    title: 'Transfer chat',
    messages: [createMessage('user', 'hello'), createMessage('assistant', 'hi')],
  })
  const asset = await assetRepository.createAsset({
    workspaceId: ws.id,
    name: 'fixture.txt',
    type: 'file',
    data: new Blob([ASSET_TEXT], { type: 'text/plain' }),
  })

  const stored = await noteRepository.getById(note.id)
  return {
    workspaceId: ws.id,
    noteId: note.id,
    blockIds: stored!.blocks.map((block) => block.id),
    nodeIds: [transformer.id, attention.id],
    edgeId: edge.id,
    conversationId: conversation.id,
    assetId: asset.id,
    assetText: ASSET_TEXT,
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    )
  }
  return value
}

/**
 * Comparable JSON with object keys sorted. A snapshot rebuilds records field by
 * field, so property order legitimately differs after a round trip; only the
 * values have to match.
 */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/** Everything that belongs to a workspace, in a stable comparable form. */
async function fingerprint(workspaceId: string): Promise<string> {
  const workspace = await workspaceRepository.getById(workspaceId)
  const notes = (await noteRepository.getByWorkspaceId(workspaceId)).sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  const conversations = (await conversationRepository.getByWorkspaceId(workspaceId)).sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  const stored = (await assetRepository.getByWorkspaceId(workspaceId)).sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  const assets = []
  for (const asset of stored) {
    assets.push({ ...asset, data: await asset.data.text() })
  }
  return canonical({ workspace, notes, conversations, assets })
}

/** A fingerprint of the whole database, for proving a rejected import changed nothing. */
async function databaseFingerprint(): Promise<string> {
  const workspaces = (await workspaceRepository.getAll()).sort((a, b) => a.id.localeCompare(b.id))
  const parts: string[] = []
  for (const workspace of workspaces) {
    parts.push(await fingerprint(workspace.id))
  }
  return parts.join('|')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Imports a deliberately broken file and asserts the code it is rejected with. */
async function rejects(raw: unknown, code: SnapshotErrorCode, label: string): Promise<void> {
  try {
    const snapshot = await readSnapshotBlob(
      new Blob([JSON.stringify(raw)], { type: 'application/json' }),
    )
    await importSnapshot(snapshot, { mode: 'restore', overwrite: true })
  } catch (error) {
    if (error instanceof SnapshotError && error.code === code) {
      return
    }
    throw new Error(
      `${label}: expected ${code}, got ${error instanceof Error ? `${error.name}/${error.message}` : String(error)}`,
    )
  }
  throw new Error(`${label}: the broken file was accepted`)
}

export async function runTransferSuite(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []
  const stamp = Date.now()
  const created: string[] = []

  const fixture = await seedFixture(`Transfer Fixture ${stamp}`)
  created.push(fixture.workspaceId)
  let snapshot: WorkspaceSnapshot | null = null
  let before = ''

  items.push(
    await check('导出 Workspace 快照', async () => {
      before = await fingerprint(fixture.workspaceId)
      snapshot = await exportWorkspaceSnapshot(fixture.workspaceId)
      const counts = describeSnapshot(snapshot)

      if (snapshot.format !== SNAPSHOT_FORMAT) throw new Error('format')
      if (snapshot.version !== SNAPSHOT_VERSION) throw new Error('version')
      if (counts.notes !== 1 || counts.blocks !== 3) throw new Error(JSON.stringify(counts))
      if (counts.nodes !== 2 || counts.edges !== 1) throw new Error(JSON.stringify(counts))
      if (counts.conversations !== 1 || counts.assets !== 1) throw new Error(JSON.stringify(counts))

      const asset = snapshot.bundle.assets[0]!
      if (typeof asset.data !== 'string' || asset.data.length === 0) throw new Error('asset base64')
      if (atob(asset.data) !== fixture.assetText) throw new Error('asset payload mismatch')
      const ids = snapshot.bundle.notes.map((note) => note.id)
      if (ids.join() !== snapshot.bundle.workspace.noteIds.join()) throw new Error('noteIds drift')
      return `notes=${counts.notes} blocks=${counts.blocks} nodes=${counts.nodes} edges=${counts.edges} assets=${counts.assets}`
    }),
  )

  items.push(
    await check('JSON 序列化往返等价', async () => {
      const roundTripped = await readSnapshotBlob(snapshotToBlob(snapshot!))
      if (canonical(roundTripped) !== canonical(snapshot)) {
        throw new Error('round trip changed the snapshot')
      }
      return `${snapshotToBlob(snapshot!).size} bytes`
    }),
  )

  items.push(
    await check('restore 模式：删除后完整恢复（含时间戳与 Blob）', async () => {
      await workspaceRepository.delete(fixture.workspaceId)
      if (await workspaceRepository.getById(fixture.workspaceId)) throw new Error('not deleted')

      const summary = await importSnapshot(snapshot!, { mode: 'restore' })
      if (summary.workspaceIds.join() !== fixture.workspaceId) throw new Error('workspace id')

      const after = await fingerprint(fixture.workspaceId)
      if (after !== before) throw new Error('restored data differs from the export')

      const note = await noteRepository.getById(fixture.noteId)
      if (note!.blocks.map((block) => block.id).join() !== fixture.blockIds.join()) {
        throw new Error('block order')
      }
      const graph = await graphRepository.getGraph(fixture.workspaceId)
      const attention = graph.nodes.find((node) => node.id === fixture.nodeIds[1])
      if (attention?.position?.x !== 120 || attention.position.y !== 240) {
        throw new Error('node position lost')
      }
      const asset = await assetRepository.getById(fixture.assetId)
      if ((await asset!.data.text()) !== fixture.assetText) throw new Error('asset payload')
      return 'workspace / notes / graph / conversation / asset 的每个字段值与导出前一致'
    }),
  )

  items.push(
    await check('restore 模式遇到已存在的工作区 → IMPORT_CONFLICT', async () => {
      const snapshotBefore = await databaseFingerprint()
      let code: string | undefined
      try {
        await importSnapshot(snapshot!, { mode: 'restore' })
      } catch (error) {
        code = error instanceof SnapshotError ? error.code : String(error)
      }
      if (code !== 'IMPORT_CONFLICT') throw new Error(`got ${code}`)
      if ((await databaseFingerprint()) !== snapshotBefore) throw new Error('data changed')
      return 'rejected, database untouched'
    }),
  )

  items.push(
    await check('restore + overwrite：覆盖掉被改坏的数据', async () => {
      const note = await noteRepository.getById(fixture.noteId)
      await noteRepository.update({ ...note!, title: 'BROKEN' })
      await blockRepository.remove(fixture.noteId, fixture.blockIds[0]!)
      await graphRepository.removeNode(fixture.workspaceId, fixture.nodeIds[0]!)

      const summary = await importSnapshot(snapshot!, { mode: 'restore', overwrite: true })
      if (summary.blocks !== 3) throw new Error(`blocks=${summary.blocks}`)
      if ((await fingerprint(fixture.workspaceId)) !== before) {
        throw new Error('overwrite did not restore the original state')
      }
      return 'title / block / node 全部恢复'
    }),
  )

  items.push(
    await check('copy 模式：与原工作区共存且引用自洽', async () => {
      const summary = await importSnapshot(snapshot!, { mode: 'copy' })
      const copyId = summary.workspaceIds[0]!
      created.push(copyId)

      if (copyId === fixture.workspaceId) throw new Error('workspace id was not remapped')
      if (!(await workspaceRepository.getById(fixture.workspaceId))) throw new Error('original lost')

      const copy = await workspaceRepository.getById(copyId)
      const notes = await noteRepository.getByWorkspaceId(copyId)
      if (notes.length !== 1) throw new Error('note count')
      if (notes[0]!.id === fixture.noteId) throw new Error('note id was not remapped')
      if (notes[0]!.workspaceId !== copyId) throw new Error('note points at the original workspace')
      if (notes[0]!.blocks.some((block) => fixture.blockIds.includes(block.id))) {
        throw new Error('block ids were not remapped')
      }

      const graph = copy!.graph
      const nodeIds = new Set(graph.nodes.map((node) => node.id))
      if (graph.nodes.some((node) => fixture.nodeIds.includes(node.id))) {
        throw new Error('node ids were not remapped')
      }
      if (graph.nodes.some((node) => node.workspaceId !== copyId)) throw new Error('node workspace')
      for (const edge of graph.edges) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          throw new Error('copied edge points outside the copied graph')
        }
      }
      const noteIds = new Set(notes.map((note) => note.id))
      for (const node of graph.nodes) {
        if (node.noteId !== undefined && !noteIds.has(node.noteId)) {
          throw new Error('copied node points at the original note')
        }
      }
      const linked = graph.nodes.find((node) => node.noteId !== undefined)
      if (!linked) throw new Error('note link lost in the copy')
      if (linked.position?.x !== 120) throw new Error('position lost in the copy')

      const assets = await assetRepository.getByWorkspaceId(copyId)
      if (assets.length !== 1 || (await assets[0]!.data.text()) !== fixture.assetText) {
        throw new Error('asset payload lost in the copy')
      }
      if (!copy!.metadata.name.includes('副本')) throw new Error('copy name not marked')
      return `原 ${fixture.workspaceId} + 副本 ${copyId}，ID 全部重映射`
    }),
  )

  items.push(
    await check('全量备份：多工作区导出 / 导入为副本', async () => {
      const second = await seedFixture(`Transfer Second ${stamp}`)
      created.push(second.workspaceId)

      const backup = await exportBackupSnapshot()
      const counts = describeSnapshot(backup)
      if (counts.workspaces < 3) throw new Error(`workspaces=${counts.workspaces}`)

      // Import just the two fixtures as copies to keep the run bounded.
      const subset: Snapshot = {
        ...backup,
        bundles: backup.bundles.filter((bundle) =>
          [fixture.workspaceId, second.workspaceId].includes(bundle.workspace.id),
        ),
      }
      const summary = await importSnapshot(subset, { mode: 'copy' })
      created.push(...summary.workspaceIds)
      if (summary.workspaceIds.length !== 2) throw new Error('expected 2 copies')
      if (summary.noteIds.length !== 2) throw new Error(`note count=${summary.noteIds.length}`)
      return `备份含 ${counts.workspaces} 个工作区；导入 2 个副本 ${summary.workspaceIds.join(', ')}`
    }),
  )

  items.push(
    await check('单篇 Note 导出并导入到另一个工作区', async () => {
      const target = await workspaceRepository.createWorkspace(`Transfer Target ${stamp}`)
      created.push(target.id)

      const noteSnapshot = await exportNoteSnapshot(fixture.noteId)
      if (noteSnapshot.kind !== 'note') throw new Error('kind')

      const summary = await importSnapshot(noteSnapshot, {
        mode: 'copy',
        workspaceId: target.id,
      })
      const newNoteId = summary.noteIds[0]!
      if (newNoteId === fixture.noteId) throw new Error('note id was not remapped')

      const stored = await noteRepository.getById(newNoteId)
      const reloadedTarget = await workspaceRepository.getById(target.id)
      if (stored?.workspaceId !== target.id) throw new Error('note workspace')
      if (stored.blocks.length !== 3) throw new Error('blocks lost')
      if (!reloadedTarget!.noteIds.includes(newNoteId)) throw new Error('workspace.noteIds')
      return `${fixture.noteId} → ${newNoteId}（${stored.blocks.length} blocks）`
    }),
  )

  items.push(
    await check('缺少目标工作区的 Note 导入 → MISSING_TARGET', async () => {
      const noteSnapshot = await exportNoteSnapshot(fixture.noteId)
      let code: string | undefined
      try {
        await importSnapshot(noteSnapshot, { mode: 'copy' })
      } catch (error) {
        code = error instanceof SnapshotError ? error.code : String(error)
      }
      if (code !== 'MISSING_TARGET') throw new Error(`got ${code}`)
      return 'MISSING_TARGET'
    }),
  )

  items.push(
    await check('非法文件全部被拒绝且数据库无变化', async () => {
      const dbBefore = await databaseFingerprint()
      const valid = clone(snapshot!) as unknown as Record<string, unknown>

      await rejects({ ...valid, format: 'something-else' }, 'INVALID_FORMAT', 'format')
      await rejects({ ...valid, version: SNAPSHOT_VERSION + 1 }, 'UNSUPPORTED_VERSION', 'version')
      await rejects({ ...valid, kind: 'everything' }, 'INVALID_FORMAT', 'kind')
      await rejects({ ...valid, bundle: 'nope' }, 'INVALID_SNAPSHOT', 'bundle shape')

      const danglingEdge = clone(snapshot!)
      danglingEdge.bundle.workspace.graph.edges[0]!.target = 'node_ghost'
      await rejects(danglingEdge, 'INVALID_SNAPSHOT', 'dangling edge')

      const wrongOwner = clone(snapshot!)
      wrongOwner.bundle.notes[0]!.workspaceId = 'ws_somewhere_else'
      await rejects(wrongOwner, 'BROKEN_REFERENCE', 'note owner')

      const missingRef = clone(snapshot!)
      missingRef.bundle.workspace.noteIds = []
      await rejects(missingRef, 'BROKEN_REFERENCE', 'noteIds')

      const ghostNoteLink = clone(snapshot!)
      ghostNoteLink.bundle.workspace.graph.nodes[1]!.noteId = 'note_ghost'
      await rejects(ghostNoteLink, 'BROKEN_REFERENCE', 'node.noteId')

      const emptyBlock = clone(snapshot!)
      const firstBlock = emptyBlock.bundle.notes[0]!.blocks[0]!
      if (firstBlock.type === 'concept') firstBlock.data.content = ''
      await rejects(emptyBlock, 'INVALID_SNAPSHOT', 'block data')

      const badAsset = clone(snapshot!)
      badAsset.bundle.assets[0]!.data = '!!!not-base64!!!'
      await rejects(badAsset, 'INVALID_SNAPSHOT', 'asset base64')

      if ((await databaseFingerprint()) !== dbBefore) {
        throw new Error('a rejected import changed the database')
      }
      return '10 类非法文件被拒，数据库内容无任何变化'
    }),
  )

  for (const id of created) {
    try {
      await workspaceRepository.delete(id)
    } catch {
      /* already gone */
    }
  }

  if (!allPass(items)) {
    issues.push(
      ...items.filter((item) => item.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`),
    )
  }

  return {
    id: '7-transfer',
    title: '7. 导出 / 导入（快照）测试',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}
