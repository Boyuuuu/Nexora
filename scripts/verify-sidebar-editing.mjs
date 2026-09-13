import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

// Exercise real actions, operations, validation and repositories against isolated transactional storage.
const cacheDir = await mkdtemp(join(tmpdir(), 'nexora-sidebar-'))
const preferences = new Map()
globalThis.localStorage = { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) }
const server = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
  plugins: [{ name: 'isolated-transactions', enforce: 'pre', load(id) {
    if (!id.endsWith('/src/data/db/database.ts')) return
    return `
      const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      let saved = {workspaces: {}, notes: {}, conversations: {}, assets: {}};
      export class DatabaseError extends Error {}
      export function closeDatabase() {}
      export async function openDatabase() { throw new Error('Raw database access is unavailable in this test'); }
      export async function deleteDatabase() { throw new Error('Database deletion is unavailable in this test'); }
      export async function runTransaction(names, mode, work) {
        const data = clone(saved);
        const result = await work({store: (name) => ({
          get: async (id) => clone(data[name][id]),
          getAll: async () => Object.keys(data[name]).sort().map((id) => clone(data[name][id])),
          getAllByIndex: async (_, workspaceId) => clone(Object.values(data[name]).filter((item) => item.workspaceId === workspaceId)),
          add: async (item) => { if (data[name][item.id]) throw new Error('Duplicate id'); data[name][item.id] = clone(item); },
          put: async (item) => { data[name][item.id] = clone(item); },
          delete: async (id) => { delete data[name][id]; },
          count: async () => Object.keys(data[name]).length,
        })});
        if (mode === 'readwrite') saved = data;
        return result;
      }
    `
  } }],
})

try {
  const { workspaceRepository, noteRepository, BLOCK_TYPES, exportWorkspaceSnapshot, parseSnapshot } = await server.ssrLoadModule('/src/data/index.ts')
  const { executeOperation } = await server.ssrLoadModule('/src/operations/index.ts')
  const { useKnowledgeStore, resetKnowledgeStore } = await server.ssrLoadModule('/src/stores/knowledgeStore.ts')
  const { useWorkspaceActions } = await server.ssrLoadModule('/src/composables/useWorkspaceActions.ts')
  const { defaultBlockInput } = await server.ssrLoadModule('/src/workspace/blockDefaults.ts')
  const a = await workspaceRepository.createWorkspace('A')
  const b = await workspaceRepository.createWorkspace('B')
  const c = await workspaceRepository.createWorkspace('C')
  const a1 = await noteRepository.createNote({workspaceId: a.id, title: 'A1'})
  const a2 = await noteRepository.createNote({workspaceId: a.id, title: 'A2'})
  const a3 = await noteRepository.createNote({workspaceId: a.id, title: 'A3'})
  const b1 = await noteRepository.createNote({workspaceId: b.id, title: 'B1'})
  const b2 = await noteRepository.createNote({workspaceId: b.id, title: 'B2'})
  const store = useKnowledgeStore(), actions = useWorkspaceActions(), { ui } = actions
  await store.loadWorkspaces()
  await actions.openWorkspaceNote(a.id, a1.id)
  ui.selectBlock('keep-selection')
  await actions.renameNote(b1.id, 'Renamed B1')
  await actions.renameNote(a2.id, 'Renamed A2')
  assert.equal(store.note.value.id, a1.id)
  assert.equal(store.workspace.value.id, a.id)
  assert.equal(ui.selectedBlockId.value, 'keep-selection')
  assert.equal((await store.listWorkspaceNotes(b.id))[0].title, 'Renamed B1')
  assert.equal(store.notes.value.find((item) => item.id === a2.id).title, 'Renamed A2')
  console.log('PASS: renaming notes in current and inactive workspaces preserves the editor')

  await actions.moveWorkspaceNote(a.id, a1.id, a3.id, true)
  await actions.moveWorkspaceNote(b.id, b2.id, b1.id, false)
  assert.deepEqual(store.notes.value.map((item) => item.id), [a2.id, a3.id, a1.id])
  assert.deepEqual((await store.listWorkspaceNotes(b.id)).map((item) => item.id), [b2.id, b1.id])
  await assert.rejects(workspaceRepository.moveNote(a.id, b1.id, a1.id, true))
  assert.deepEqual((await workspaceRepository.getById(a.id)).noteIds, [a2.id, a3.id, a1.id])
  assert.equal(store.note.value.id, a1.id)
  const ids = (await workspaceRepository.getAll()).map((item) => item.id)
  await actions.moveWorkspace(ids[2], ids[0], false)
  const expectedOrder = [ids[2], ids[0], ids[1]]
  assert.deepEqual(store.workspaces.value.map((item) => item.id), expectedOrder)
  const d = await workspaceRepository.createWorkspace('D')
  assert.deepEqual((await workspaceRepository.getAll()).map((item) => item.id), [...expectedOrder, d.id])
  resetKnowledgeStore()
  await store.loadWorkspaces()
  assert.deepEqual(store.workspaces.value.map((item) => item.id), [...expectedOrder, d.id])
  assert.deepEqual((await store.listWorkspaceNotes(a.id)).map((item) => item.id), [a2.id, a3.id, a1.id])
  await actions.openWorkspaceNote(a.id, a1.id)
  console.log('PASS: both orders survive store reset; cross-workspace moves are rejected without data changes')

  for (const type of BLOCK_TYPES) {
    const before = store.blocks.value.length
    await actions.createBlock(type)
    assert.equal(store.lastError.value, null, type)
    assert.equal(store.blocks.value.length, before + 1, type)
    assert.equal(store.blocks.value.at(-1).type, type)
    assert.equal(ui.selectedBlockId.value, store.blocks.value.at(-1).id)
  }
  const textId = store.blocks.value.find((block) => block.type === 'text').id
  await actions.updateBlock(textId, {data: {content: 'Saved content'}})
  assert.equal((await noteRepository.getById(a1.id)).blocks[0].data.content, 'Saved content')
  await actions.renameNote(a1.id, 'Renamed with blocks')
  assert.equal(store.blocks.value[0].data.content, 'Saved content')
  await actions.updateBlock(textId, {data: {content: ''}})
  assert.equal(store.lastError.value, null)
  const exploreId = store.blocks.value.find((block) => block.type === 'exploration').id
  await actions.updateBlock(exploreId, {data: {items: []}})
  assert.equal(store.lastError.value, null)
  const saved = await exportWorkspaceSnapshot(a.id)
  const parsed = parseSnapshot(saved)
  assert.deepEqual(parsed.bundle.workspace.noteIds, [a2.id, a3.id, a1.id])
  assert.equal(parsed.bundle.notes.find((item) => item.id === a1.id).blocks.length, 7)
  console.log('PASS: all seven empty block types create, select, edit, clear, persist and export/parse')

  for (const [type, data] of [['text', {content: 123}], ['concept', {content: ''}], ['math', {latex: null}], ['exploration', {items: [42]}]]) {
    const block = { ...defaultBlockInput('bad-block', type), data }
    const result = await executeOperation({operation: 'create_block', workspace_id: a.id, note_id: a1.id, block})
    assert.equal(result.success, false)
    assert.equal(result.error.code, 'INVALID_BLOCK_DATA')
  }
  assert.equal((await noteRepository.getById(a1.id)).blocks.length, 7)
  console.log('PASS: missing required fields and malformed block values remain rejected')

  async function remove(id, confirm = true) {
    const pending = actions.deleteNote(id)
    ui.resolveConfirm(confirm)
    return pending
  }
  assert.equal(await remove(a1.id, false), false)
  assert.equal(store.note.value.id, a1.id)
  await remove(b1.id)
  await remove(a2.id)
  assert.equal(store.workspace.value.id, a.id)
  assert.equal(store.note.value.id, a1.id)
  assert.equal((await workspaceRepository.getById(b.id)).noteIds.includes(b1.id), false)
  await remove(a1.id)
  assert.equal(store.note.value.id, a3.id)
  assert.equal(ui.selectedBlockId.value, null)
  await remove(a3.id)
  assert.equal(store.note.value, null)
  assert.deepEqual(store.notes.value, [])
  assert.equal(store.workspace.value.id, a.id)
  await actions.openWorkspaceNote(b.id, b2.id)
  assert.equal(await remove('missing-note'), false)
  assert.equal(store.note.value.id, b2.id)
  console.log('PASS: cancelled/failed deletions, inactive deletion, active fallback and last-note empty state')
} finally {
  await server.close()
  await rm(cacheDir, {recursive: true, force: true})
}
