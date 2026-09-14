import { blockRepository, nowIso, type Block, type Note } from '../data'
import type { BlockOperation } from './types'
import { requireBlock, requireBlockAnchor, requireBlockType, requireChanges, requireId, requireKnownDataFields, requireObject, requireUnusedBlockId, requireValidBlock } from './validation'

/** Validate and simulate the entire batch before a single compare-and-swap write. */
export function previewBlockBatch(expected: Note, operations: BlockOperation[]): Note {
  if (!operations.length || operations.length > 32) throw new Error('一次整理需要包含 1–32 项改动。')
  const next: Note = JSON.parse(JSON.stringify(expected))
  // Pending previews and undo snapshots live in Vue refs. Copy the JSON operation
  // payload as well as the Note: spreading a reactive block keeps nested proxies
  // (data, items, tags), which IndexedDB rejects with DataCloneError.
  const plainOperations: BlockOperation[] = JSON.parse(JSON.stringify(operations))
  const timestamp = nowIso()
  for (const op of plainOperations) {
    if (op.note_id !== expected.id || op.workspace_id !== expected.workspaceId) throw new Error('改动超出了本次笔记范围。')
    const id = requireId(op, op.operation === 'create_block' ? op.block.id : op.block_id, 'block_id')
    const existing = op.operation === 'create_block' ? undefined : requireBlock(op, next, id)
    if (op.operation === 'delete_block') {
      next.blocks = next.blocks.filter((b) => b.id !== id)
      continue
    }
    if (op.operation === 'move_block' || op.operation === 'create_block') {
      if (op.operation === 'move_block' && op.after_block_id === undefined) throw new Error('移动缺少目标位置。')
      requireBlockAnchor(op, next, op.after_block_id, op.operation === 'move_block' ? id : undefined)
      if (op.operation === 'move_block') next.blocks = next.blocks.filter((b) => b.id !== id)
      else requireUnusedBlockId(op, next, id)
      let block = existing
      if (op.operation === 'create_block') {
        requireObject(op, op.block, 'block')
        requireBlockType(op, op.block.type)
        requireKnownDataFields(op, op.block.type, op.block.data)
        block = { ...op.block, metadata: { ...op.block.metadata, createdAt: timestamp, updatedAt: timestamp } } as Block
        requireValidBlock(op, block)
      }
      const at = op.after_block_id === undefined ? next.blocks.length
        : op.after_block_id === null ? 0 : next.blocks.findIndex((b) => b.id === op.after_block_id) + 1
      next.blocks.splice(at, 0, block!)
      continue
    }
    let block: Block
    if (op.operation === 'update_block') {
      requireChanges(op, op.changes, ['data', 'metadata'], ['id', 'type'])
      if (op.changes.data !== undefined) requireKnownDataFields(op, existing!.type, op.changes.data)
      block = { ...existing!, data: { ...existing!.data, ...op.changes.data }, metadata: { ...existing!.metadata, ...op.changes.metadata, updatedAt: timestamp } } as Block
    } else {
      requireObject(op, op.block, 'block')
      if (op.block.id !== id) throw new Error('替换不能改变 Block ID。')
      requireBlockType(op, op.block.type)
      requireKnownDataFields(op, op.block.type, op.block.data)
      block = { ...op.block, metadata: { ...op.block.metadata, createdAt: existing!.metadata.createdAt, updatedAt: timestamp } } as Block
    }
    requireValidBlock(op, block)
    next.blocks[next.blocks.findIndex((b) => b.id === id)] = block
  }
  return next
}

export async function executeBlockBatch(expected: Note, operations: BlockOperation[]): Promise<Note> {
  const next = previewBlockBatch(expected, operations)
  return blockRepository.compareAndSwap(expected, next.blocks)
}
