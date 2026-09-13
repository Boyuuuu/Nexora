/**
 * Block — the smallest knowledge unit inside a Note.
 *
 * `BlockDataByType` is the single source of truth binding each block type to
 * its payload shape. `Block` is derived from it as a discriminated union, so
 * narrowing on `block.type` narrows `block.data` automatically.
 */

/**
 * Shared payload for prose-like blocks. `TextBlockData` and `ExampleBlockData`
 * stay as distinct aliases so call sites remain semantically clear, while the
 * shape lives in one place.
 */
export interface ContentBlockData {
  title?: string
  content: string
}

export type TextBlockData = ContentBlockData

export interface ConceptBlockData {
  title: string
  content: string
}

export interface IntuitionBlockData {
  title: string
  content: string
}

export interface MathBlockData {
  title?: string
  latex: string
  explanation?: string
}

export interface CodeBlockData {
  title?: string
  language: string
  code: string
}

export type ExampleBlockData = ContentBlockData

export interface ExplorationBlockData {
  title?: string
  items: string[]
}

export interface BlockDataByType {
  text: TextBlockData
  concept: ConceptBlockData
  intuition: IntuitionBlockData
  math: MathBlockData
  code: CodeBlockData
  example: ExampleBlockData
  exploration: ExplorationBlockData
}

export type BlockType = keyof BlockDataByType

export type BlockData = BlockDataByType[BlockType]

/**
 * Field-by-field patch for a block's `data`. A caller that names a block by id
 * only learns its concrete type at runtime, so this spans every payload field;
 * the stored block's type decides which of them are actually accepted.
 */
export type BlockDataPatch = Partial<
  TextBlockData &
    ConceptBlockData &
    IntuitionBlockData &
    MathBlockData &
    CodeBlockData &
    ExampleBlockData &
    ExplorationBlockData
>

export const BLOCK_TYPES = [
  'text',
  'concept',
  'intuition',
  'math',
  'code',
  'example',
  'exploration',
] as const satisfies readonly BlockType[]

/**
 * The writable `data` keys of each block type. `keyof BlockDataByType[T]` keeps
 * this in step with the payload interfaces above, so callers that patch data
 * field by field (the Operations layer) cannot drift from the model.
 */
export const BLOCK_DATA_FIELDS: {
  readonly [T in BlockType]: readonly (keyof BlockDataByType[T])[]
} = {
  text: ['title', 'content'],
  concept: ['title', 'content'],
  intuition: ['title', 'content'],
  math: ['title', 'latex', 'explanation'],
  code: ['title', 'language', 'code'],
  example: ['title', 'content'],
  exploration: ['title', 'items'],
}

/** Reserved for future provenance tracking; nothing generates `'ai'` yet. */
export type BlockSource = 'user' | 'ai' | 'import'

export const BLOCK_SOURCES = ['user', 'ai', 'import'] as const satisfies readonly BlockSource[]

export interface BlockMetadata {
  createdAt: string
  updatedAt: string
  source?: BlockSource
  tags?: string[]
}

export interface TypedBlock<T extends BlockType> {
  id: string
  type: T
  data: BlockDataByType[T]
  metadata: BlockMetadata
}

export type Block = { [T in BlockType]: TypedBlock<T> }[BlockType]

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value)
}

export function isBlockSource(value: unknown): value is BlockSource {
  return typeof value === 'string' && (BLOCK_SOURCES as readonly string[]).includes(value)
}
