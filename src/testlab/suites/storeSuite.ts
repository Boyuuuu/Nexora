/**
 * The store is what components actually talk to, so these checks are about the
 * contract views depend on: after a successful Operation the store's state
 * already matches IndexedDB, and after a failed one nothing moved.
 */

import { createId, noteRepository, workspaceRepository } from '../../data'
import { resetKnowledgeStore, useKnowledgeStore } from '../../stores/knowledgeStore'
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

export async function runStoreSuite(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []
  const store = useKnowledgeStore()

  const ws = await workspaceRepository.createWorkspace(`Store Suite ${Date.now()}`)
  const blockId = createId('block')
  const nodeId = createId('node')

  items.push(
    await check('loadWorkspaces / selectWorkspace 载入工作区与笔记', async () => {
      await store.loadWorkspaces()
      if (!store.workspaces.value.some((item) => item.id === ws.id)) {
        throw new Error('new workspace missing from the list')
      }

      await store.createNote(ws.id, 'Store Note')
      await store.selectWorkspace(ws.id)
      if (store.workspace.value?.id !== ws.id) throw new Error('workspace not selected')
      if (store.notes.value.length !== 1) throw new Error(`notes=${store.notes.value.length}`)
      if (store.note.value?.title !== 'Store Note') throw new Error('note not selected')
      return `workspace=${ws.id} notes=${store.notes.value.length}`
    }),
  )

  const noteId = store.note.value?.id ?? ''

  items.push(
    await check('run(create_block) 后 store.blocks 自动反映', async () => {
      const result = await store.run({
        operation: 'create_block',
        workspace_id: ws.id,
        note_id: noteId,
        block: { id: blockId, type: 'concept', data: { title: 'B1', content: 'alpha' } },
      })
      if (!result.success) throw new Error(result.error?.message ?? 'failed')
      if (store.blocks.value.length !== 1) throw new Error('store.blocks not refreshed')
      if (store.blocks.value[0]?.id !== blockId) throw new Error('wrong block')
      if (store.lastError.value !== null) throw new Error('lastError should be clear')
      return `blocks=${store.blocks.value.length}（未手动重读）`
    }),
  )

  items.push(
    await check('run(create_node) 后 store.graph 自动反映', async () => {
      const result = await store.run({
        operation: 'create_node',
        workspace_id: ws.id,
        node: { id: nodeId, label: 'Transformer', type: 'architecture', note_id: noteId },
      })
      if (!result.success) throw new Error(result.error?.message ?? 'failed')
      if (store.graph.value.nodes.length !== 1) throw new Error('store.graph not refreshed')
      if (store.graph.value.nodes[0]?.id !== nodeId) throw new Error('wrong node')
      return `nodes=${store.graph.value.nodes.length}`
    }),
  )

  items.push(
    await check('run(move_node) 后 position 出现在 store 里', async () => {
      await store.run({
        operation: 'move_node',
        workspace_id: ws.id,
        node_id: nodeId,
        position: { x: 40, y: 90 },
      })
      const node = store.graph.value.nodes[0]
      if (node?.position?.x !== 40 || node.position.y !== 90) {
        throw new Error(JSON.stringify(node?.position))
      }
      return `position=(${node.position.x}, ${node.position.y})`
    }),
  )

  items.push(
    await check('失败的 Operation：lastError 有值且数据未变', async () => {
      const snapshot = JSON.stringify(store.blocks.value)
      const result = await store.run({
        operation: 'update_block',
        workspace_id: ws.id,
        note_id: noteId,
        block_id: 'block_missing',
        changes: { data: { content: 'x' } },
      })
      if (result.success) throw new Error('unexpectedly succeeded')
      if (result.error?.code !== 'TARGET_NOT_FOUND') throw new Error(result.error?.code)
      if (!store.lastError.value?.includes('TARGET_NOT_FOUND')) {
        throw new Error(`lastError=${store.lastError.value}`)
      }
      if (JSON.stringify(store.blocks.value) !== snapshot) throw new Error('blocks changed')

      store.clearError()
      if (store.lastError.value !== null) throw new Error('clearError failed')
      return 'TARGET_NOT_FOUND 已上抛，blocks 不变'
    }),
  )

  items.push(
    await check('createNote / renameNote / deleteNote 同步到 store', async () => {
      const extra = await store.createNote(ws.id, 'Second Note')
      if (!extra) throw new Error('createNote returned null')
      const afterCreate: number = store.notes.value.length
      if (afterCreate !== 2) throw new Error(`notes=${afterCreate}`)

      await store.renameNote(extra.id, 'Renamed')
      if (store.note.value?.title !== 'Renamed') throw new Error('note not renamed in store')
      if (!store.notes.value.some((item) => item.title === 'Renamed')) {
        throw new Error('list not refreshed')
      }

      await store.deleteNote(extra.id)
      const afterDelete: number = store.notes.value.length
      if (afterDelete !== 1) throw new Error('list still holds the deleted note')
      if (store.note.value !== null) throw new Error('deleted note still selected')
      return 'create / rename / delete 三步后列表与选中项一致'
    }),
  )

  items.push(
    await check('reload() 能反映外部改动', async () => {
      await store.selectNote(noteId)
      const current = await noteRepository.getById(noteId)
      await noteRepository.update({ ...current!, title: 'Changed Elsewhere' })

      if (store.note.value?.title === 'Changed Elsewhere') {
        throw new Error('store should not have seen the change yet')
      }
      await store.reload()
      if (store.note.value?.title !== 'Changed Elsewhere') throw new Error('reload did not refresh')
      return 'reload 后标题为 Changed Elsewhere'
    }),
  )

  items.push(
    await check('deleteWorkspace 清空选中状态', async () => {
      await store.deleteWorkspace(ws.id)
      if (store.workspace.value !== null) throw new Error('workspace still selected')
      const leftover: number = store.notes.value.length
      if (leftover !== 0) throw new Error('notes not cleared')
      if (store.note.value !== null) throw new Error('note not cleared')
      if (store.workspaces.value.some((item) => item.id === ws.id)) {
        throw new Error('workspace still listed')
      }
      return '选中项与列表均已清理'
    }),
  )

  resetKnowledgeStore()

  if (!allPass(items)) {
    issues.push(
      ...items.filter((item) => item.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`),
    )
  }

  return {
    id: 'op-3',
    title: '3. Store 层（UI → Operation → 自动重读）',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}
