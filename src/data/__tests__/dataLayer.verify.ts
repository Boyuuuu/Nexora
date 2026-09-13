import { assetRepository } from '../repositories/assetRepository'
import { blockRepository, createBlock } from '../repositories/blockRepository'
import { conversationRepository } from '../repositories/conversationRepository'
import { graphRepository } from '../repositories/graphRepository'
import { noteRepository } from '../repositories/noteRepository'
import { workspaceRepository } from '../repositories/workspaceRepository'
import {
  DEMO_NOTE_TITLE,
  DEMO_WORKSPACE_NAME,
  findDemoWorkspace,
  resetDemoWorkspace,
  seedDemoWorkspace,
} from './demoWorkspace'

/**
 * Browser-side verification for the knowledge data layer. Run it from the
 * devtools console:
 *
 *   await nexora.runDataLayerVerification()   // Test 1-11, leaves data behind
 *   // refresh the page
 *   await nexora.verifyPersistence()          // Test 12
 */

export interface TestResult {
  test: string
  name: string
  passed: boolean
  detail: string
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

async function runTest(
  results: TestResult[],
  test: string,
  name: string,
  body: () => Promise<string>,
): Promise<void> {
  try {
    const detail = await body()
    results.push({ test, name, passed: true, detail })
  } catch (error) {
    results.push({
      test,
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function runDataLayerVerification(): Promise<TestResult[]> {
  const results: TestResult[] = []
  await resetDemoWorkspace()

  const demo = await seedDemoWorkspace()
  const workspaceId = demo.workspace.id
  const noteId = demo.note.id

  await runTest(results, 'Test 1', 'Create Workspace', async () => {
    assert(workspaceId.startsWith('ws_'), 'workspace id should use the ws_ prefix')
    assert(demo.workspace.metadata.name === DEMO_WORKSPACE_NAME, 'workspace name mismatch')
    return `created ${workspaceId}`
  })

  await runTest(results, 'Test 2', 'Read Workspace', async () => {
    const stored = await workspaceRepository.getById(workspaceId)
    assert(stored !== undefined, 'workspace was not found')
    assert(stored!.noteIds.includes(noteId), 'workspace.noteIds is missing the note reference')
    assert(stored!.conversationIds.length === 1, 'workspace.conversationIds should hold 1 id')
    assert(stored!.assetIds.length === 1, 'workspace.assetIds should hold 1 id')
    return `noteIds=${stored!.noteIds.length}, conversationIds=${stored!.conversationIds.length}, assetIds=${stored!.assetIds.length}`
  })

  await runTest(results, 'Test 3', 'Create Note', async () => {
    assert(noteId.startsWith('note_'), 'note id should use the note_ prefix')
    assert(demo.note.title === DEMO_NOTE_TITLE, 'note title mismatch')
    assert(demo.note.blocks.length === 4, 'demo note should start with 4 blocks')
    return `created ${noteId} with ${demo.note.blocks.length} blocks`
  })

  await runTest(results, 'Test 4', 'Read Note', async () => {
    const stored = await noteRepository.getById(noteId)
    assert(stored !== undefined, 'note was not found')
    const byWorkspace = await noteRepository.getByWorkspaceId(workspaceId)
    assert(byWorkspace.length === 1, 'byWorkspaceId index should return exactly 1 note')
    const types = stored!.blocks.map((block) => block.type).join(', ')
    return `blocks: ${types}`
  })

  let addedBlockId = ''

  await runTest(results, 'Test 5', 'Add Block to Note', async () => {
    const block = createBlock(
      'code',
      {
        title: 'Attention in NumPy',
        language: 'python',
        code: 'scores = q @ k.T / np.sqrt(d_k)\nweights = softmax(scores)\nout = weights @ v',
      },
      { source: 'user' },
    )
    addedBlockId = block.id

    const note = await blockRepository.add(noteId, block)
    assert(note.blocks.length === 5, 'note should hold 5 blocks after the insert')
    assert(note.blocks[4]?.id === block.id, 'new block should be appended last')
    return `added ${block.id} (${note.blocks.length} blocks)`
  })

  await runTest(results, 'Test 6', 'Update Block', async () => {
    const replacement = {
      ...createBlock(
        'code',
        {
          title: 'Attention in NumPy (annotated)',
          language: 'python',
          code: '# scaled dot-product\nscores = q @ k.T / np.sqrt(d_k)\nout = softmax(scores) @ v',
        },
        { source: 'user', tags: ['code', 'numpy'] },
      ),
      id: addedBlockId,
    }

    const note = await blockRepository.update(noteId, replacement)

    const updated = note.blocks.find((block) => block.id === addedBlockId)
    assert(updated !== undefined, 'updated block disappeared')
    assert(updated!.type === 'code', 'block type should stay code')
    assert(
      updated!.type === 'code' && updated!.data.code.includes('# scaled dot-product'),
      'block data was not updated',
    )
    assert(
      updated!.metadata.updatedAt >= updated!.metadata.createdAt,
      'updatedAt should advance on write',
    )

    // Reordering goes through the same path, so cover it here.
    const reordered = await blockRepository.move(noteId, addedBlockId, 0)
    assert(reordered.blocks[0]?.id === addedBlockId, 'block should have moved to index 0')
    return `updated + moved ${addedBlockId} to index 0`
  })

  await runTest(results, 'Test 7', 'Delete Block', async () => {
    const note = await blockRepository.remove(noteId, addedBlockId)
    assert(note.blocks.length === 4, 'note should be back to 4 blocks')
    assert(
      !note.blocks.some((block) => block.id === addedBlockId),
      'deleted block is still present',
    )
    return `removed ${addedBlockId} (${note.blocks.length} blocks left)`
  })

  await runTest(results, 'Test 8', 'Create Graph Node', async () => {
    const nodes = await graphRepository.getNodes(workspaceId)
    const labels = nodes.map((node) => node.label)
    assert(labels.includes('Transformer'), 'Transformer node missing')
    assert(labels.includes('Attention'), 'Attention node missing')
    assert(labels.includes('QKV'), 'QKV node missing')
    assert(demo.nodes.attention.noteId === noteId, 'Attention node should link to the note')
    return `nodes: ${labels.join(', ')}`
  })

  await runTest(results, 'Test 9', 'Create Graph Edge', async () => {
    const edges = await graphRepository.getEdges(workspaceId)
    assert(edges.length === 2, 'expected 2 edges')
    assert(
      edges.some(
        (edge) =>
          edge.source === demo.nodes.transformer.id &&
          edge.target === demo.nodes.attention.id &&
          edge.type === 'contains',
      ),
      'Transformer -> Attention edge missing',
    )
    assert(
      edges.some(
        (edge) => edge.source === demo.nodes.attention.id && edge.target === demo.nodes.qkv.id,
      ),
      'Attention -> QKV edge missing',
    )

    let rejected = false
    try {
      await graphRepository.addEdge(workspaceId, {
        source: demo.nodes.transformer.id,
        target: 'node_does_not_exist',
        type: 'contains',
      })
    } catch {
      rejected = true
    }
    assert(rejected, 'an edge pointing at an unknown node should be rejected')
    return 'Transformer -> Attention -> QKV, dangling edge rejected'
  })

  await runTest(results, 'Test 10', 'Create Conversation', async () => {
    const stored = await conversationRepository.getById(demo.conversation.id)
    assert(stored !== undefined, 'conversation was not found')
    assert(stored!.messages.length === 4, 'conversation should hold 4 messages')
    const roles = stored!.messages.map((message) => message.role).join(', ')
    assert(roles === 'user, assistant, user, assistant', `unexpected role order: ${roles}`)
    return `messages: ${roles}`
  })

  await runTest(results, 'Test 11', 'Create Asset', async () => {
    const stored = await assetRepository.getById(demo.asset.id)
    assert(stored !== undefined, 'asset was not found')
    assert(stored!.data instanceof Blob, 'asset.data should come back as a Blob')
    assert(stored!.size === stored!.data.size, 'asset.size should match the Blob size')
    assert(stored!.mimeType === 'image/svg+xml', 'asset mimeType mismatch')
    return `${stored!.name} (${stored!.mimeType}, ${stored!.size} bytes)`
  })

  report('Nexora data layer — Test 1-11', results)
  console.info(
    '[nexora] Data is persisted. Refresh the page and run `await nexora.verifyPersistence()` for Test 12.',
  )
  return results
}

/** Test 12 — run after a page refresh to prove IndexedDB kept everything. */
export async function verifyPersistence(): Promise<TestResult[]> {
  const results: TestResult[] = []

  await runTest(results, 'Test 12', 'Reload after browser refresh', async () => {
    const workspace = await findDemoWorkspace()
    assert(workspace !== undefined, `no workspace named "${DEMO_WORKSPACE_NAME}" — seed it first`)

    const notes = await noteRepository.getByWorkspaceId(workspace!.id)
    const conversations = await conversationRepository.getByWorkspaceId(workspace!.id)
    const assets = await assetRepository.getByWorkspaceId(workspace!.id)
    const graph = await graphRepository.getGraph(workspace!.id)

    assert(notes.length === 1, 'note did not survive the refresh')
    assert(notes[0]?.blocks.length === 4, 'note blocks did not survive the refresh')
    assert(conversations.length === 1, 'conversation did not survive the refresh')
    assert(conversations[0]?.messages.length === 4, 'messages did not survive the refresh')
    assert(assets.length === 1, 'asset did not survive the refresh')
    assert(assets[0]?.data instanceof Blob, 'asset Blob did not survive the refresh')
    assert(graph.nodes.length === 3, 'graph nodes did not survive the refresh')
    assert(graph.edges.length === 2, 'graph edges did not survive the refresh')

    return `workspace=${workspace!.id}, notes=${notes.length}, blocks=${notes[0]!.blocks.length}, nodes=${graph.nodes.length}, edges=${graph.edges.length}, conversations=${conversations.length}, assets=${assets.length}`
  })

  report('Nexora data layer — Test 12', results)
  return results
}

/** Runs Test 1-11 and then removes the demo workspace again. */
export async function runAndCleanUp(): Promise<TestResult[]> {
  const results = await runDataLayerVerification()
  await resetDemoWorkspace()
  return results
}

function report(title: string, results: TestResult[]): void {
  const failed = results.filter((result) => !result.passed)
  console.group(`${title} — ${results.length - failed.length}/${results.length} passed`)
  console.table(
    results.map((result) => ({
      Test: result.test,
      Name: result.name,
      Result: result.passed ? 'PASS' : 'FAIL',
      Detail: result.detail,
    })),
  )
  console.groupEnd()
}
