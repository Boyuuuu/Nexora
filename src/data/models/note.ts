import type { Block } from './block'

export interface NoteMetadata {
  createdAt: string
  updatedAt: string
}

/**
 * Blocks are embedded in the Note record for now. Callers only reach them
 * through `blockRepository`, so a future move to a dedicated `blocks` store
 * (Note holding `blockIds`) stays contained inside the data layer.
 */
export interface Note {
  id: string
  workspaceId: string
  title: string
  blocks: Block[]
  metadata: NoteMetadata
}
