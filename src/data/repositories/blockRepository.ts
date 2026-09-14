import { runTransaction } from '../db/database'
import { STORES } from '../db/schema'
import type {
  Block,
  BlockDataByType,
  BlockDataPatch,
  BlockSource,
  BlockType,
  TypedBlock,
} from '../models/block'
import type { Note } from '../models/note'
import { createId } from '../utils/id'
import { nowIso } from '../utils/time'
import { validateBlock, validateNote } from '../validation'
import { ConflictError, loadWorkspace, NotFoundError } from './internal'

export interface CreateBlockOptions {
  source?: BlockSource
  tags?: string[]
}

export interface BlockPatch {
  data?: BlockDataPatch
  metadata?: CreateBlockOptions
}

/**
 * Where a block goes, expressed relative to a sibling instead of an array
 * index: a block id means right after that block, `null` means the head of the
 * note, `undefined` means the end. Resolved inside the write transaction, so
 * the anchor cannot move between the lookup and the write.
 */
export type BlockAnchor = string | null | undefined

/**
 * Blocks live inside their Note record, so every mutation reads the note,
 * rewrites `blocks`, and stores the note again in one transaction.
 */

export function createBlock<T extends BlockType>(
  type: T,
  data: BlockDataByType[T],
  options: CreateBlockOptions = {},
): TypedBlock<T> {
  const timestamp = nowIso()
  return {
    id: createId('block'),
    type,
    data,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.tags === undefined ? {} : { tags: options.tags }),
    },
  }
}

async function mutateBlocks(
  noteId: string,
  mutate: (blocks: Block[]) => Block[],
): Promise<Note> {
  return runTransaction(STORES.notes, 'readwrite', async (ctx) => {
    const notes = ctx.store<Note>(STORES.notes)
    const note = await notes.get(noteId)
    if (!note) {
      throw new NotFoundError(`Note not found: ${noteId}`)
    }

    const updated: Note = {
      ...note,
      blocks: mutate(note.blocks),
      metadata: { ...note.metadata, updatedAt: nowIso() },
    }
    validateNote(updated)
    await notes.put(updated)
    return updated
  })
}

function indexOfBlock(blocks: Block[], blockId: string): number {
  const index = blocks.findIndex((block) => block.id === blockId)
  if (index === -1) {
    throw new NotFoundError(`Block not found: ${blockId}`)
  }
  return index
}

export const blockRepository = {
  createBlock,

  async compareAndSwap(expected: Note, blocks: Block[]): Promise<Note> {
    return runTransaction([STORES.notes, STORES.workspaces], 'readwrite', async (ctx) => {
      const notes = ctx.store<Note>(STORES.notes)
      const current = await notes.get(expected.id)
      if (!current) throw new NotFoundError('原笔记已删除，未写入 AI 改动。')
      await loadWorkspace(ctx, expected.workspaceId)
      if (current.workspaceId !== expected.workspaceId || current.metadata.updatedAt !== expected.metadata.updatedAt
        || JSON.stringify(current.blocks) !== JSON.stringify(expected.blocks)) {
        throw new ConflictError('笔记在生成期间发生了变化，未覆盖你的编辑。请重新整理后预览。')
      }
      const updated = { ...current, blocks, metadata: { ...current.metadata, updatedAt: nowIso() } }
      validateNote(updated)
      await notes.put(updated)
      return updated
    })
  },

  async getByNoteId(noteId: string): Promise<Block[]> {
    const note = await runTransaction(STORES.notes, 'readonly', (ctx) =>
      ctx.store<Note>(STORES.notes).get(noteId),
    )
    if (!note) {
      throw new NotFoundError(`Note not found: ${noteId}`)
    }
    return note.blocks
  },

  async getById(noteId: string, blockId: string): Promise<Block | undefined> {
    const blocks = await blockRepository.getByNoteId(noteId)
    return blocks.find((block) => block.id === blockId)
  },

  /** Appends by default; pass `index` to insert at a position. */
  async add(noteId: string, block: Block, index?: number): Promise<Note> {
    validateBlock(block)
    return mutateBlocks(noteId, (blocks) => {
      const next = [...blocks]
      const position = index === undefined ? next.length : clamp(index, 0, next.length)
      next.splice(position, 0, block)
      return next
    })
  },

  /**
   * Replaces a block wholesale. Taking a complete `Block` keeps the type/data
   * pairing enforced by the union itself; `createdAt` is preserved and
   * `updatedAt` is refreshed by the repository.
   */
  async update(noteId: string, block: Block): Promise<Note> {
    validateBlock(block)
    return mutateBlocks(noteId, (blocks) => {
      const position = indexOfBlock(blocks, block.id)
      const current = blocks[position]!

      const next: Block = {
        ...block,
        metadata: {
          ...block.metadata,
          createdAt: current.metadata.createdAt,
          updatedAt: nowIso(),
        },
      }

      const result = [...blocks]
      result[position] = next
      return result
    })
  },

  /** Inserts relative to a sibling; see `BlockAnchor`. */
  async addAfter(noteId: string, block: Block, after: BlockAnchor): Promise<Note> {
    validateBlock(block)
    return mutateBlocks(noteId, (blocks) => {
      const next = [...blocks]
      next.splice(anchorTarget(blocks, after), 0, block)
      return next
    })
  },

  /**
   * Merges partial `data` / `metadata` into an existing block. `id`, `type` and
   * `createdAt` stay under repository control and cannot be patched.
   */
  async patch(noteId: string, blockId: string, patch: BlockPatch): Promise<Note> {
    return mutateBlocks(noteId, (blocks) => {
      const position = indexOfBlock(blocks, blockId)
      const current = blocks[position]!

      const next = {
        ...current,
        data: { ...current.data, ...patch.data },
        metadata: {
          ...current.metadata,
          ...patch.metadata,
          createdAt: current.metadata.createdAt,
          updatedAt: nowIso(),
        },
      } as Block

      validateBlock(next)
      const result = [...blocks]
      result[position] = next
      return result
    })
  },

  async remove(noteId: string, blockId: string): Promise<Note> {
    return mutateBlocks(noteId, (blocks) => {
      indexOfBlock(blocks, blockId)
      return blocks.filter((block) => block.id !== blockId)
    })
  },

  async move(noteId: string, blockId: string, toIndex: number): Promise<Note> {
    return mutateBlocks(noteId, (blocks) => {
      const from = indexOfBlock(blocks, blockId)
      const next = [...blocks]
      const [moved] = next.splice(from, 1)
      next.splice(clamp(toIndex, 0, next.length), 0, moved as Block)
      return next
    })
  },

  /** Reorders relative to a sibling; see `BlockAnchor`. */
  async moveAfter(noteId: string, blockId: string, after: BlockAnchor): Promise<Note> {
    if (after === blockId) {
      throw new NotFoundError(`A block cannot be moved after itself: ${blockId}`)
    }
    return mutateBlocks(noteId, (blocks) => {
      const from = indexOfBlock(blocks, blockId)
      const next = [...blocks]
      const [moved] = next.splice(from, 1)
      next.splice(anchorTarget(next, after), 0, moved as Block)
      return next
    })
  },
}

/** Resolves an anchor to the insertion index within `blocks`. */
function anchorTarget(blocks: Block[], after: BlockAnchor): number {
  if (after === undefined) {
    return blocks.length
  }
  if (after === null) {
    return 0
  }
  return indexOfBlock(blocks, after) + 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max)
}
