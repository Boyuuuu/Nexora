import { createId, type Block, type BlockType, type Note } from '../data'
import type { BlockInput, Operation } from '../operations'
import type { EditPatch } from './protocol'

export interface AppliedChange {
  action: EditPatch['action']
  blockId: string
  before: Block | null
  afterAnchor: string | null
}

export interface EditTask {
  id: string
  workspaceId: string
  noteId: string
  changes: AppliedChange[]
}

function toInput(block: Block): BlockInput {
  return {
    id: block.id,
    type: block.type,
    data: block.data,
    metadata: {
      source: block.metadata.source ?? 'ai',
      tags: block.metadata.tags,
    },
  } as BlockInput
}

function inputFromPatch(id: string, type: BlockType, data: EditPatch['data']): BlockInput {
  return {
    id,
    type,
    data,
    metadata: { source: 'ai' },
  } as BlockInput
}

export function patchesToOperations(
  workspaceId: string,
  note: Note,
  patches: EditPatch[],
): { operations: Operation[]; snapshots: AppliedChange[] } {
  const operations: Operation[] = []
  const snapshots: AppliedChange[] = []
  const live = note.blocks.map((block) => block.id)

  function currentAnchor(id: string): string | null {
    const index = live.indexOf(id)
    if (index <= 0) return null
    return live[index - 1] ?? null
  }

  for (const patch of patches) {
    if (patch.action === 'create') {
      const id = createId('block')
      if (!patch.type || !patch.data) continue
      operations.push({
        operation: 'create_block',
        workspace_id: workspaceId,
        note_id: note.id,
        block: inputFromPatch(id, patch.type, patch.data),
        after_block_id: patch.after_block_id === undefined ? undefined : patch.after_block_id,
      })
      snapshots.push({ action: 'create', blockId: id, before: null, afterAnchor: patch.after_block_id ?? null })
      const after = patch.after_block_id
      const at = after ? live.indexOf(after) + 1 : 0
      live.splice(after === undefined ? live.length : at, 0, id)
      continue
    }

    const blockId = patch.block_id
    if (!blockId) continue
    const existing = note.blocks.find((block) => block.id === blockId) ?? null
    const afterAnchor = currentAnchor(blockId)

    if (patch.action === 'delete') {
      operations.push({
        operation: 'delete_block',
        workspace_id: workspaceId,
        note_id: note.id,
        block_id: blockId,
      })
      snapshots.push({ action: 'delete', blockId, before: existing, afterAnchor })
      const index = live.indexOf(blockId)
      if (index >= 0) live.splice(index, 1)
      continue
    }

    if (patch.action === 'move') {
      operations.push({
        operation: 'move_block',
        workspace_id: workspaceId,
        note_id: note.id,
        block_id: blockId,
        after_block_id: patch.after_block_id ?? null,
      })
      snapshots.push({ action: 'move', blockId, before: existing, afterAnchor })
      const from = live.indexOf(blockId)
      if (from >= 0) live.splice(from, 1)
      const at = patch.after_block_id ? live.indexOf(patch.after_block_id) + 1 : 0
      live.splice(patch.after_block_id === null ? 0 : at, 0, blockId)
      continue
    }

    if (!patch.type || !patch.data || !existing) continue
    const sameType = existing.type === patch.type
    operations.push(sameType && patch.action !== 'replace'
      ? {
          operation: 'update_block',
          workspace_id: workspaceId,
          note_id: note.id,
          block_id: blockId,
          changes: { data: patch.data, metadata: { source: 'ai' } },
        }
      : {
          operation: 'replace_block',
          workspace_id: workspaceId,
          note_id: note.id,
          block_id: blockId,
          block: inputFromPatch(blockId, patch.type, patch.data),
        })
    snapshots.push({
      action: sameType ? 'update' : 'replace',
      blockId,
      before: existing,
      afterAnchor,
    })
  }

  return { operations, snapshots }
}

export function undoOperations(task: EditTask): Operation[] {
  const operations: Operation[] = []
  for (const change of [...task.changes].reverse()) {
    if (change.action === 'create') {
      operations.push({
        operation: 'delete_block',
        workspace_id: task.workspaceId,
        note_id: task.noteId,
        block_id: change.blockId,
      })
      continue
    }
    if (change.action === 'delete' && change.before) {
      operations.push({
        operation: 'create_block',
        workspace_id: task.workspaceId,
        note_id: task.noteId,
        block: toInput(change.before),
        after_block_id: change.afterAnchor,
      })
      continue
    }
    if (change.action === 'move') {
      operations.push({
        operation: 'move_block',
        workspace_id: task.workspaceId,
        note_id: task.noteId,
        block_id: change.blockId,
        after_block_id: change.afterAnchor,
      })
      continue
    }
    if (change.before) {
      operations.push({
        operation: 'replace_block',
        workspace_id: task.workspaceId,
        note_id: task.noteId,
        block_id: change.blockId,
        block: toInput(change.before),
      })
    }
  }
  return operations
}

export function undoOneBlock(task: EditTask, blockId: string): { operations: Operation[]; remaining: AppliedChange[] } {
  const index = [...task.changes].map((change, i) => ({ change, i })).reverse().find((item) => item.change.blockId === blockId)?.i
  if (index === undefined) return { operations: [], remaining: task.changes }
  const subset: EditTask = { ...task, changes: [task.changes[index]!] }
  return {
    operations: undoOperations(subset),
    remaining: task.changes.filter((_, i) => i !== index),
  }
}
