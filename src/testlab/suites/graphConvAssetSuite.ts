import {
  assetRepository,
  conversationRepository,
  createMessage,
  graphRepository,
  noteRepository,
  ValidationError,
  workspaceRepository,
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

export async function runGraphConvAssetSuite(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []

  const ws = await workspaceRepository.createWorkspace(`GCA Suite ${Date.now()}`)
  const note = await noteRepository.createNote({
    workspaceId: ws.id,
    title: 'Linked Note',
  })

  let nodeA = ''
  let nodeB = ''
  let edgeId = ''
  let convId = ''
  let assetId = ''

  items.push(
    await check('创建 Node', async () => {
      const a = await graphRepository.addNode(ws.id, {
        label: 'Transformer',
        type: 'architecture',
      })
      const b = await graphRepository.addNode(ws.id, {
        label: 'Attention',
        type: 'mechanism',
        noteId: note.id,
      })
      nodeA = a.id
      nodeB = b.id
      if (a.workspaceId !== ws.id || b.workspaceId !== ws.id) {
        throw new Error('workspaceId mismatch')
      }
      if (b.noteId !== note.id) throw new Error('noteId not linked')
      return `${a.label}, ${b.label}`
    }),
  )

  items.push(
    await check('修改 Node', async () => {
      const updated = await graphRepository.updateNode(ws.id, nodeB, {
        label: 'Self-Attention',
        type: 'mechanism',
      })
      if (updated.label !== 'Self-Attention') throw new Error('label not updated')
      return updated.label
    }),
  )

  items.push(
    await check('创建 Edge + 验证 source/target', async () => {
      const edge = await graphRepository.addEdge(ws.id, {
        source: nodeA,
        target: nodeB,
        type: 'contains',
      })
      edgeId = edge.id
      if (edge.source !== nodeA || edge.target !== nodeB) throw new Error('refs wrong')
      if (edge.workspaceId !== ws.id) throw new Error('workspaceId')
      return `${edge.source} --${edge.type}--> ${edge.target}`
    }),
  )

  items.push(
    await check('无效 Edge 被拒绝', async () => {
      let rejected = false
      try {
        await graphRepository.addEdge(ws.id, {
          source: nodeA,
          target: 'node_missing',
          type: 'contains',
        })
      } catch (error) {
        rejected = error instanceof ValidationError || /unknown node/i.test(String(error))
      }
      if (!rejected) throw new Error('dangling edge accepted')
      return 'dangling target rejected'
    }),
  )

  items.push(
    await check('删除 Node 后清理相关 Edge', async () => {
      await graphRepository.removeNode(ws.id, nodeA)
      const graph = await graphRepository.getGraph(ws.id)
      if (graph.nodes.some((n) => n.id === nodeA)) throw new Error('node remains')
      if (graph.edges.some((e) => e.id === edgeId)) throw new Error('orphan edge remains')
      if (graph.edges.some((e) => e.source === nodeA || e.target === nodeA)) {
        throw new Error('dangling edge refs')
      }
      return 'node + touching edges removed'
    }),
  )

  items.push(
    await check('创建 Conversation（多条 Message）', async () => {
      const conv = await conversationRepository.createConversation({
        workspaceId: ws.id,
        title: 'Explore',
        messages: [
          createMessage('user', 'What is attention?'),
          createMessage('assistant', 'A soft lookup over tokens.'),
          createMessage('user', 'And QKV?'),
          createMessage('assistant', 'Query, Key, Value projections.'),
        ],
      })
      convId = conv.id
      if (conv.workspaceId !== ws.id) throw new Error('workspaceId')
      if (conv.messages.length !== 4) throw new Error('message count')
      const roles = conv.messages.map((m) => m.role).join(',')
      if (roles !== 'user,assistant,user,assistant') throw new Error(roles)
      return roles
    }),
  )

  items.push(
    await check('查询和修改 Conversation', async () => {
      const stored = await conversationRepository.getById(convId)
      if (!stored) throw new Error('missing')
      const appended = await conversationRepository.appendMessage(
        convId,
        'user',
        'One more question',
      )
      if (appended.messages.length !== 5) throw new Error('append failed')
      const renamed = await conversationRepository.update({
        ...appended,
        title: 'Explore (edited)',
      })
      if (renamed.title !== 'Explore (edited)') throw new Error('title')
      return `messages=${renamed.messages.length} title=${renamed.title}`
    }),
  )

  items.push(
    await check('创建 Asset（Blob）', async () => {
      const blob = new Blob(['nexora-asset-bytes'], { type: 'text/plain' })
      const asset = await assetRepository.createAsset({
        workspaceId: ws.id,
        name: 'fixture.txt',
        type: 'file',
        data: blob,
      })
      assetId = asset.id
      if (!(asset.data instanceof Blob)) throw new Error('not Blob')
      if (asset.size !== blob.size) throw new Error('size mismatch')
      if (asset.workspaceId !== ws.id) throw new Error('workspaceId')
      return `${asset.name} ${asset.size}B`
    }),
  )

  items.push(
    await check('查询和删除 Asset', async () => {
      const stored = await assetRepository.getById(assetId)
      if (!stored || !(stored.data instanceof Blob)) throw new Error('read fail')
      const text = await stored.data.text()
      if (text !== 'nexora-asset-bytes') throw new Error('blob content mismatch')
      await assetRepository.delete(assetId)
      const gone = await assetRepository.getById(assetId)
      if (gone) throw new Error('still present')
      const ws2 = await workspaceRepository.getById(ws.id)
      if (ws2?.assetIds.includes(assetId)) throw new Error('orphan assetIds')
      return 'blob readable then deleted cleanly'
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
    id: '5-gca',
    title: '5. Graph / Conversation / Asset 测试',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}
