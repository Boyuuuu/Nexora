import { reactive } from 'vue'
import type { Note } from '../data'

// Track local editor buffers as well as IndexedDB revisions when AI writes in the background.
const pending = reactive(new Set<string>())
export function setBlockDraftPending(id: string, value: boolean): void {
  if (value) pending.add(id)
  else pending.delete(id)
}
export function hasPendingNoteDrafts(note: Note): boolean {
  return note.blocks.some((block) => pending.has(block.id))
}
