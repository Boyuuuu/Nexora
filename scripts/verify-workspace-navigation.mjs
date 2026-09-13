import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

// In-memory repositories keep this verification separate from the user's IndexedDB.
const savedPreferences = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => savedPreferences.get(key) ?? null,
    setItem: (key, value) => savedPreferences.set(key, value),
  },
  configurable: true,
})
const cacheDir = await mkdtemp(join(tmpdir(), 'nexora-navigation-'))
const server = await createServer({
  configFile: false,
  cacheDir,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
})

try {
  const { workspaceRepository, noteRepository, createEmptyGraph } = await server.ssrLoadModule('/src/data/index.ts')
  const { useKnowledgeStore, resetKnowledgeStore } = await server.ssrLoadModule('/src/stores/knowledgeStore.ts')
  const { useWorkspaceActions } = await server.ssrLoadModule('/src/composables/useWorkspaceActions.ts')
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const timestamp = new Date().toISOString()
  const workspace = (id, noteIds) => ({
    id, noteIds, graph: createEmptyGraph(), conversationIds: [], assetIds: [],
    metadata: { name: id, createdAt: timestamp, updatedAt: timestamp },
  })
  const note = (id, workspaceId) => ({
    id, workspaceId, title: '同名笔记', blocks: [],
    metadata: { createdAt: timestamp, updatedAt: timestamp },
  })
  const workspaces = new Map([['a', workspace('a', ['a2', 'a1'])], ['b', workspace('b', ['b1'])]])
  const notes = new Map([['a1', note('a1', 'a')], ['a2', note('a2', 'a')], ['b1', note('b1', 'b')]])
  workspaceRepository.getAll = async () => clone([...workspaces.values()])
  workspaceRepository.getById = async (id) => clone(workspaces.get(id))
  workspaceRepository.createWorkspace = async (name) => {
    const created = workspace('new-workspace', [])
    created.metadata.name = name
    workspaces.set(created.id, created)
    return clone(created)
  }
  noteRepository.getByWorkspaceId = async (id) => clone([...notes.values()].filter((item) => item.workspaceId === id))
  noteRepository.getById = async (id) => clone(notes.get(id))
  noteRepository.createNote = async ({ workspaceId, title }) => {
    const created = { ...note('created-note', workspaceId), title }
    notes.set(created.id, created)
    workspaces.get(workspaceId).noteIds.push(created.id)
    return clone(created)
  }
  noteRepository.update = async (updated) => {
    notes.set(updated.id, clone(updated))
    return clone(updated)
  }
  noteRepository.rename = async (id, title) => noteRepository.update({ ...notes.get(id), title })

  resetKnowledgeStore()
  const store = useKnowledgeStore()
  const actions = useWorkspaceActions()
  const { ui } = actions
  await store.loadWorkspaces()
  await store.selectWorkspace('a')
  await store.selectNote('a1')
  ui.selectBlock('selected-block')

  assert.deepEqual((await store.listWorkspaceNotes('a')).map((item) => item.id), ['a2', 'a1'])
  assert.deepEqual((await store.listWorkspaceNotes('b')).map((item) => item.id), ['b1'])
  assert.equal(store.workspace.value.id, 'a')
  assert.equal(store.note.value.id, 'a1')
  assert.equal(ui.selectedBlockId.value, 'selected-block')
  assert.equal(ui.mode.value, 'note')
  console.log('PASS: expanding other workspace branches preserves the editor and note order')

  assert.equal(await actions.createWorkspaceNote('b'), true)
  assert.deepEqual(workspaces.get('a').noteIds, ['a2', 'a1'])
  assert.deepEqual(workspaces.get('b').noteIds, ['b1', 'created-note'])
  assert.equal(store.workspace.value.id, 'b')
  assert.equal(store.note.value.id, 'created-note')
  assert.equal(store.note.value.workspaceId, 'b')
  assert.equal(ui.selectedBlockId.value, null)
  console.log('PASS: the Notes plus button creates and opens a note in its own workspace')

  assert.equal(await actions.openWorkspaceNote('a', 'a2'), true)
  assert.equal(store.note.value.id, 'a2')
  assert.equal(store.workspace.value.id, 'a')
  assert.equal(ui.mode.value, 'note')
  assert.equal(await actions.openWorkspaceNote('a', 'b1'), false)
  assert.equal(store.note.value.id, 'a2')
  console.log('PASS: cross-workspace navigation distinguishes same-named notes and rejects the wrong branch')

  await store.renameNote('a2', 'Renamed note')
  assert.equal((await store.listWorkspaceNotes('a'))[0].title, 'Renamed note')
  ui.setMode('canvas')
  ui.selectNode('node-from-a')
  ui.requestFocusNode('node-from-a')
  assert.equal(await actions.openWorkspaceCanvas('b'), true)
  assert.equal(store.workspace.value.id, 'b')
  assert.equal(ui.mode.value, 'canvas')
  assert.equal(ui.selectedNodeId.value, null)
  assert.equal(ui.focusNodeId.value, null)
  assert.equal(ui.inspectOpen.value, false)
  console.log('PASS: note names refresh and canvas navigation clears the previous workspace selection')

  ui.setAiPanelOpen(false)
  ui.toggleAiPanel()
  assert.equal(ui.isAiPanelOpen.value, true)
  ui.toggleAiPanel()
  assert.equal(ui.isAiPanelOpen.value, false)
  ui.selectNode('node-from-b')
  ui.toggleAiPanel()
  assert.equal(ui.inspectOpen.value, false)
  assert.equal(ui.isAiPanelOpen.value, true)
  assert.equal(ui.selectedNodeId.value, null)
  console.log('PASS: chat opens, closes, and returns from the node inspector')

  await actions.createWorkspace('New workspace')
  assert.equal(store.workspace.value.metadata.name, 'New workspace')
  assert.equal(store.note.value, null)
  assert.deepEqual(await store.listWorkspaceNotes('new-workspace'), [])
  assert.equal(ui.mode.value, 'note')
  console.log('PASS: creating a workspace opens an empty workspace without carrying over a note')
} finally {
  await server.close()
  await rm(cacheDir, { recursive: true, force: true })
}
