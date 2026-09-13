import { blockRepository, nowIso, type Block, type BlockPatch, type Note } from '../../data'
import { fail } from '../errors'
import type {
  BlockInput,
  BlockOperation,
  CreateBlockOperation,
  DeleteBlockOperation,
  MoveBlockOperation,
  UpdateBlockOperation,
} from '../types'
import {
  requireBlock,
  requireBlockAnchor,
  requireBlockType,
  requireChanges,
  requireId,
  requireKnownDataFields,
  requireNote,
  requireObject,
  requireUnusedBlockId,
  requireValidBlock,
  requireWorkspace,
} from '../validation'

/** `update_block` may reach `data` and `metadata`, and nothing else. */
const BLOCK_CHANGE_FIELDS = ['data', 'metadata'] as const
const BLOCK_IDENTITY_FIELDS = ['id', 'type'] as const

/** Every block operation is addressed as workspace → note → block. */
async function loadNote(operation: BlockOperation): Promise<Note> {
  requireId(operation, operation.workspace_id, 'workspace_id')
  requireId(operation, operation.note_id, 'note_id')
  await requireWorkspace(operation, operation.workspace_id)
  return requireNote(operation, operation.workspace_id, operation.note_id)
}

/** Fills in the timestamps the protocol leaves to the data layer. */
function buildBlock(input: BlockInput): Block {
  const timestamp = nowIso()
  const { source, tags } = input.metadata ?? {}
  return {
    ...input,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(source === undefined ? {} : { source }),
      ...(tags === undefined ? {} : { tags }),
    },
  }
}

/**
 * Mirrors the merge `blockRepository.patch` performs inside its transaction,
 * so an illegal patch is caught before anything is written.
 */
function withPatch(block: Block, patch: BlockPatch): Block {
  return {
    ...block,
    data: { ...block.data, ...patch.data },
    metadata: { ...block.metadata, ...patch.metadata },
  } as Block
}

export async function handleCreateBlock(operation: CreateBlockOperation): Promise<string[]> {
  const note = await loadNote(operation)

  requireObject(operation, operation.block, 'block')
  const input = operation.block
  const blockId = requireId(operation, input.id, 'block.id')
  const type = requireBlockType(operation, input.type)

  requireUnusedBlockId(operation, note, blockId)
  requireBlockAnchor(operation, note, operation.after_block_id)
  requireKnownDataFields(operation, type, input.data)

  const block = buildBlock(input)
  requireValidBlock(operation, block)

  await blockRepository.addAfter(note.id, block, operation.after_block_id)
  return [blockId]
}

export async function handleUpdateBlock(operation: UpdateBlockOperation): Promise<string[]> {
  const note = await loadNote(operation)
  const blockId = requireId(operation, operation.block_id, 'block_id')
  const block = requireBlock(operation, note, blockId)

  requireChanges(operation, operation.changes, BLOCK_CHANGE_FIELDS, BLOCK_IDENTITY_FIELDS)
  const { data, metadata } = operation.changes

  if (data !== undefined) {
    requireKnownDataFields(operation, block.type, data)
  }
  if (metadata !== undefined) {
    requireObject(operation, metadata, 'changes.metadata')
  }

  const patch: BlockPatch = {
    ...(data === undefined ? {} : { data }),
    ...(metadata === undefined ? {} : { metadata }),
  }
  requireValidBlock(operation, withPatch(block, patch))

  await blockRepository.patch(note.id, blockId, patch)
  return [blockId]
}

export async function handleMoveBlock(operation: MoveBlockOperation): Promise<string[]> {
  const note = await loadNote(operation)
  const blockId = requireId(operation, operation.block_id, 'block_id')
  requireBlock(operation, note, blockId)

  if (operation.after_block_id === undefined) {
    fail(
      'INVALID_OPERATION',
      'move_block requires after_block_id; use null to move to the front',
      operation,
    )
  }
  requireBlockAnchor(operation, note, operation.after_block_id, blockId)

  await blockRepository.moveAfter(note.id, blockId, operation.after_block_id)
  return [blockId]
}

export async function handleDeleteBlock(operation: DeleteBlockOperation): Promise<string[]> {
  const note = await loadNote(operation)
  const blockId = requireId(operation, operation.block_id, 'block_id')
  requireBlock(operation, note, blockId)

  await blockRepository.remove(note.id, blockId)
  return [blockId]
}
