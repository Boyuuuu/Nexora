import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

// Exercise real actions, operations, validation and repositories against isolated transactional storage.
const cacheDir = await mkdtemp(join(tmpdir(), 'nexora-transfer-'))
const preferences = new Map()
globalThis.localStorage = { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) }
const server = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
  plugins: [{ name: 'isolated-transactions', enforce: 'pre', load(id) {
    if (!id.endsWith('/src/data/db/database.ts')) return
    return `
      const clone = (value) => structuredClone(value);
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
  const { workspaceRepository, noteRepository, exportWorkspaceSnapshot, exportNoteSnapshot, snapshotToBlob, describeSnapshot } = await server.ssrLoadModule('/src/data/index.ts')
  const { useKnowledgeStore } = await server.ssrLoadModule('/src/stores/knowledgeStore.ts')
  const { useWorkspaceUi } = await server.ssrLoadModule('/src/composables/useWorkspaceUi.ts')
  const { useKnowledgeTransfer } = await server.ssrLoadModule('/src/composables/useKnowledgeTransfer.ts')
  const store = useKnowledgeStore(), ui = useWorkspaceUi()
  const a = await workspaceRepository.createWorkspace('Current workspace')
  const b = await workspaceRepository.createWorkspace('Other workspace')
  const a1 = await noteRepository.createNote({workspaceId: a.id, title:'Current note'})
  const b1 = await noteRepository.createNote({workspaceId: b.id, title:'Export note'})
  await store.loadWorkspaces()
  await store.selectWorkspace(a.id)
  await store.selectNote(a1.id)
  ui.selectBlock('keep-selection')
  const downloads = []
  const transfer = useKnowledgeTransfer((snapshot) => downloads.push(snapshot))
  await transfer.initialize()
  assert.equal(transfer.workspaceId.value, a.id)
  assert.equal(transfer.noteId.value, a1.id)
  await transfer.selectWorkspace(b.id)
  assert.equal(store.workspace.value.id, a.id)
  assert.equal(store.note.value.id, a1.id)
  assert.equal(ui.selectedBlockId.value, 'keep-selection')
  transfer.scope.value = 'note'
  assert.equal(await transfer.exportFile(), true)
  assert.equal(downloads.at(-1).note.id, b1.id)
  transfer.scope.value = 'workspace'
  await transfer.exportFile()
  assert.equal(downloads.at(-1).bundle.workspace.id, b.id)
  transfer.scope.value = 'all'
  await transfer.exportFile()
  assert.equal(describeSnapshot(downloads.at(-1)).workspaces, 2)
  assert.equal(store.note.value.id, a1.id)
  console.log('PASS: defaults follow current content; all three export scopes preserve the editor')

  const read = transfer.store.listWorkspaceNotes
  let release
  transfer.store.listWorkspaceNotes = async (id) => {
    if (id === a.id) await new Promise((resolve) => { release = resolve })
    return read(id)
  }
  const slow = transfer.selectWorkspace(a.id)
  await transfer.selectWorkspace(b.id)
  release()
  await slow
  assert.equal(transfer.workspaceId.value, b.id)
  assert.equal(transfer.noteId.value, b1.id)
  transfer.store.listWorkspaceNotes = read
  console.log('PASS: late note-list responses cannot override a newer export selection')

  await transfer.selectFile(new File(['not json'], 'broken.json'))
  assert.equal(transfer.canImport.value, false)
  assert.match(transfer.problem.value, /JSON/)
  assert.equal((await workspaceRepository.getAll()).length, 2)
  const snapshot = await exportWorkspaceSnapshot(b.id)
  const asFile = (snapshot, name = 'backup.json') => new File([snapshotToBlob(snapshot)], name)
  await transfer.selectFile(asFile(snapshot))
  assert.equal(transfer.preview.value.notes, 1)
  assert.equal(transfer.mode.value, 'copy')
  assert.equal(transfer.overwrite.value, false)
  assert.equal(await transfer.importFile(), true)
  assert.equal((await workspaceRepository.getAll()).length, 3)
  assert.equal(store.workspace.value.id, a.id)
  assert.equal(store.note.value.id, a1.id)
  assert.equal(await transfer.importFile(), false)
  console.log('PASS: invalid files are rejected; copy import refreshes the tree without navigation or duplicate submission')

  await transfer.selectFile(asFile(snapshot))
  transfer.mode.value = 'restore'
  assert.equal(await transfer.importFile(), false)
  assert.match(transfer.problem.value, /已存在/)
  await noteRepository.rename(b1.id, 'Changed after export')
  transfer.overwrite.value = true
  assert.equal(await transfer.importFile(), true)
  assert.equal((await noteRepository.getById(b1.id)).title, 'Export note')
  assert.equal(store.note.value.id, a1.id)
  console.log('PASS: restore reports conflicts and requires explicit replacement before overwriting')

  const noteSnapshot = await exportNoteSnapshot(b1.id)
  await transfer.selectFile(asFile(noteSnapshot, 'note.json'))
  transfer.targetId.value = ''
  assert.equal(transfer.canImport.value, false)
  transfer.targetId.value = a.id
  assert.equal(await transfer.importFile(), true)
  assert.equal(store.workspace.value.id, a.id)
  assert.equal(store.note.value.id, a1.id)
  assert.equal(store.notes.value.length, 2)
  assert.equal(transfer.imported.value.workspaceIds[0], a.id)
  await transfer.initialize()
  assert.equal(transfer.picked.value, null)
  assert.equal(transfer.imported.value, null)
  assert.equal(transfer.workspaceId.value, a.id)
  console.log('PASS: single-note import requires its target; reopening clears the previous file and result')

  const { runTransferSuite } = await server.ssrLoadModule('/src/testlab/suites/transferSuite.ts')
  const result = await runTransferSuite()
  assert.equal(result.items.every((item) => item.verdict === 'PASS'), true, JSON.stringify(result))
  console.log('PASS: existing transfer suite covers complete backup, attachments, restore, copy and invalid-file handling')
} finally {
  await server.close()
  await rm(cacheDir, {recursive: true, force: true})
}
