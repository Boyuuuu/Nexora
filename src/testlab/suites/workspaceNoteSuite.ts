import {
  ConflictError,
  NotFoundError,
  ValidationError,
  noteRepository,
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

export async function runWorkspaceNoteSuite(): Promise<SuiteResult> {
  const items: TestItem[] = []
  const issues: string[] = []
  let workspaceId = ''
  let noteId = ''

  items.push(
    await check('创建 Workspace', async () => {
      const ws = await workspaceRepository.createWorkspace(
        `TestLab WS ${Date.now()}`,
        'workspace-note suite',
      )
      workspaceId = ws.id
      if (!ws.id.startsWith('ws_')) throw new Error('id prefix wrong')
      return ws.id
    }),
  )

  items.push(
    await check('查询 Workspace', async () => {
      const ws = await workspaceRepository.getById(workspaceId)
      if (!ws) throw new Error('not found')
      return `${ws.metadata.name} noteIds=${ws.noteIds.length}`
    }),
  )

  items.push(
    await check('修改 Workspace', async () => {
      const ws = await workspaceRepository.getById(workspaceId)
      if (!ws) throw new Error('missing')
      const updated = await workspaceRepository.update({
        ...ws,
        metadata: { ...ws.metadata, description: 'updated-by-testlab' },
      })
      if (updated.metadata.description !== 'updated-by-testlab') {
        throw new Error('description not updated')
      }
      return `updatedAt=${updated.metadata.updatedAt}`
    }),
  )

  items.push(
    await check('创建 Note', async () => {
      const note = await noteRepository.createNote({
        workspaceId,
        title: 'Suite Note',
      })
      noteId = note.id
      const ws = await workspaceRepository.getById(workspaceId)
      if (!ws?.noteIds.includes(noteId)) throw new Error('workspace.noteIds not linked')
      return note.id
    }),
  )

  items.push(
    await check('根据 ID 查询 Note', async () => {
      const note = await noteRepository.getById(noteId)
      if (!note || note.title !== 'Suite Note') throw new Error('mismatch')
      return note.id
    }),
  )

  items.push(
    await check('根据 workspaceId 查询 Note', async () => {
      const notes = await noteRepository.getByWorkspaceId(workspaceId)
      if (!notes.some((n) => n.id === noteId)) throw new Error('index miss')
      return `count=${notes.length}`
    }),
  )

  items.push(
    await check('修改 Note', async () => {
      const note = await noteRepository.getById(noteId)
      if (!note) throw new Error('missing')
      const updated = await noteRepository.update({ ...note, title: 'Suite Note Edited' })
      if (updated.title !== 'Suite Note Edited') throw new Error('title not updated')
      return updated.title
    }),
  )

  items.push(
    await check('删除 Note + 关联清理', async () => {
      await noteRepository.delete(noteId)
      const gone = await noteRepository.getById(noteId)
      if (gone) throw new Error('still in IndexedDB')
      const ws = await workspaceRepository.getById(workspaceId)
      if (ws?.noteIds.includes(noteId)) throw new Error('orphan reference in workspace.noteIds')
      return 'deleted + workspace.noteIds cleaned'
    }),
  )

  items.push(
    await check('异常：不存在的 workspace 建 Note', async () => {
      let threw = false
      try {
        await noteRepository.createNote({ workspaceId: 'ws_does_not_exist', title: 'x' })
      } catch (error) {
        threw = error instanceof NotFoundError || error instanceof ValidationError
        if (!threw && error instanceof Error) threw = /not found/i.test(error.message)
      }
      if (!threw) throw new Error('should reject')
      return 'NotFoundError as expected'
    }),
  )

  items.push(
    await check('异常：重复 Workspace id', async () => {
      const ws = await workspaceRepository.getById(workspaceId)
      if (!ws) throw new Error('fixture missing')
      let threw = false
      try {
        await workspaceRepository.create(ws)
      } catch (error) {
        threw = error instanceof ConflictError
      }
      if (!threw) throw new Error('should reject duplicate')
      return 'ConflictError as expected'
    }),
  )

  // cleanup
  try {
    await workspaceRepository.delete(workspaceId)
  } catch {
    issues.push('cleanup delete workspace failed')
  }

  if (!allPass(items)) {
    issues.push(...items.filter((i) => i.verdict === 'FAIL').map((i) => `${i.name}: ${i.detail}`))
  }

  return {
    id: '3-ws-note',
    title: '3. Workspace & Note 数据层测试',
    items,
    summary: `${passCount(items)} PASS`,
    issues,
  }
}
