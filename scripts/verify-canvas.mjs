import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

// Exercise real actions, operations, validation and repositories against isolated transactional storage.
const cacheDir = await mkdtemp(join(tmpdir(), 'nexora-canvas-'))
const preferences = new Map()
globalThis.localStorage = { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) }
const server = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
  plugins: [{ name: 'isolated-transactions', enforce: 'pre', load(id) {
    if (!id.endsWith('/src/data/db/database.ts')) return
    return `
      const clone = (value) => structuredClone(value);
      export let writeCount = 0;
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
        if (mode === 'readwrite') { saved = data; writeCount++; }
        return result;
      }
    `
  } }],
})

try {
  const geometry = await server.ssrLoadModule('/src/workspace/canvasGeometry.ts')
  const { arrangeGraph } = await server.ssrLoadModule('/src/workspace/canvasLayout.ts')
  const { facingPorts, connectionPath, fitViewport, NODE_W, NODE_H } = geometry
  const a = {x: 0, y: 0}
  for (const [b, source, target] of [
    [{x: 400, y: 0}, 'right', 'left'], [{x: -400, y: 0}, 'left', 'right'],
    [{x: 0, y: 300}, 'bottom', 'top'], [{x: 0, y: -300}, 'top', 'bottom'],
    [{x: -136, y: 220}, 'bottom', 'top'],
    [{x: -272, y: 196}, 'bottom', 'top'],
  ]) {
    const ports = facingPorts(a, b)
    assert.equal(ports.source.side, source)
    assert.equal(ports.target.side, target)
  }
  for (const b of [{x: 300, y: 200}, {x: -500, y: -260}, {x: 0, y: 0}, {x: 20, y: 40}, {x: NODE_W, y: 0}]) {
    assert.equal(/NaN|Infinity/.test(connectionPath(a, b)), false)
  }
  assert.notEqual(connectionPath(a, {x: 400, y: 0}, -16), connectionPath(a, {x: 400, y: 0}, 16))
  console.log('PASS: four-direction ports, diagonal approaches, overlap/coincident nodes and parallel curves')

  const node = (id) => ({id, workspaceId: 'test', label: id, type: 'concept'})
  const edge = (source, target) => ({id: source + '-' + target, workspaceId: 'test', source, target, type: 'relates'})
  const chain = {nodes: ['a','b','c'].map(node), edges: [edge('a','b'), edge('b','c')]}
  const arranged = arrangeGraph(chain)
  assert.ok(arranged.a.y < arranged.b.y && arranged.b.y < arranged.c.y)
  for (const graph of [
    {nodes: [], edges: []}, chain,
    {nodes: ['a','b','c','d','isolated'].map(node), edges: [edge('a','b'), edge('b','c'), edge('c','a'), edge('c','d'), edge('d','d')]},
    {nodes: Array.from({length: 50}, (_, i) => node('node-' + i)), edges: []},
  ]) {
    const copy = structuredClone(graph), positions = arrangeGraph(graph)
    assert.deepEqual(graph, copy)
    assert.deepEqual(arrangeGraph(graph), positions)
    assert.equal(Object.keys(positions).length, graph.nodes.length)
    const points = Object.values(positions)
    points.forEach((p, i) => points.slice(i + 1).forEach(q => {
      assert.ok(p.x + NODE_W <= q.x || q.x + NODE_W <= p.x || p.y + NODE_H <= q.y || q.y + NODE_H <= p.y, 'cards must not overlap')
    }))
  }
  const huge = [{x: -9000, y: -7000}, {x: 12000, y: 15000}]
  for (const [width, height] of [[660, 580], [320, 480]]) {
    const view = fitViewport(huge, width, height)
    for (const point of huge) {
      assert.ok(point.x * view.zoom + view.x >= 0)
      assert.ok((point.x + NODE_W) * view.zoom + view.x <= width)
      assert.ok(point.y * view.zoom + view.y >= 0)
      assert.ok((point.y + NODE_H) * view.zoom + view.y <= height)
    }
  }
  console.log('PASS: deterministic non-overlapping layout, chains, cycles, disconnected nodes and large-graph fit')

  const { workspaceRepository, graphRepository, noteRepository } = await server.ssrLoadModule('/src/data/index.ts')
  const { executeOperation } = await server.ssrLoadModule('/src/operations/index.ts')
  const database = await server.ssrLoadModule('/src/data/db/database.ts')
  const { useWorkspaceActions } = await server.ssrLoadModule('/src/composables/useWorkspaceActions.ts')
  const actions = useWorkspaceActions(), {store} = actions
  const ws = await workspaceRepository.createWorkspace('Canvas test')
  const note = await noteRepository.createNote({workspaceId: ws.id, title: 'Linked note'})
  await graphRepository.addNode(ws.id, {id: 'a', label: 'A', type: 'concept', noteId: note.id, metadata: {keep: true}, position: {x: -50, y: 92}})
  await graphRepository.addNode(ws.id, {id: 'b', label: 'B', type: 'topic'})
  await graphRepository.addEdge(ws.id, {id: 'ab', source: 'a', target: 'b', type: 'uses'})
  await store.loadWorkspaces()
  await actions.openWorkspaceCanvas(ws.id)
  const original = structuredClone(await graphRepository.getGraph(ws.id))
  const positions = arrangeGraph(original)
  const beforeWrites = database.writeCount
  assert.equal(await actions.moveNodes(original.nodes.map(n => ({node_id: n.id, position: positions[n.id]}))), true)
  assert.equal(database.writeCount, beforeWrites + 1, 'reset is a single write transaction')
  const saved = await graphRepository.getGraph(ws.id)
  assert.deepEqual(saved.edges, original.edges)
  assert.deepEqual(saved.nodes.map(({position, ...n}) => n), original.nodes.map(({position, ...n}) => n))
  assert.deepEqual(store.graph.value, saved)
  await store.reload()
  assert.deepEqual(store.graph.value, saved)
  const undo = original.nodes.map(n => ({node_id: n.id, position: n.position ?? null}))
  assert.equal(await actions.moveNodes(undo), true)
  assert.deepEqual(await graphRepository.getGraph(ws.id), original)
  for (const entries of [[], null, [{node_id: 'a', position: {x: 0, y: 0}}, {node_id: 'missing', position: {x: 1, y: 1}}], [{node_id: 'a', position: {x: 3, y: 3}}, {node_id: 'b', position: {x: Infinity, y: 0}}], [{node_id: 'a', position: a}, {node_id: 'a', position: a}], [null]]) {
    const result = await executeOperation({operation: 'move_nodes', workspace_id: ws.id, positions: entries})
    assert.equal(result.success, false)
    assert.deepEqual(await graphRepository.getGraph(ws.id), original, 'invalid reset must not partially save')
  }
  await assert.rejects(graphRepository.moveNodes(ws.id, [{nodeId: 'a', position: a}, {nodeId: 'b', position: {x: NaN, y: 0}}]))
  assert.deepEqual(await graphRepository.getGraph(ws.id), original)
  assert.equal(await actions.moveNode('a', {x: 700, y: -88}), true)
  assert.deepEqual((await graphRepository.getGraph(ws.id)).nodes[0].position, {x: 700, y: -88})
  console.log('PASS: atomic reset, reload persistence, undo unplaced state, preserved content, rejected invalid writes and drag persistence')
} finally {
  await server.close()
  await rm(cacheDir, {recursive: true, force: true})
}
