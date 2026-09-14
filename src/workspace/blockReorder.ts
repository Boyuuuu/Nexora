export interface BlockPlacement { targetId: string; after: boolean }
export interface BlockBounds { id: string; top: number; bottom: number }

/** Hit-test the gaps, including the first and last positions, without the source. */
export function blockPlacementAt(rows: BlockBounds[], draggedId: string, y: number): BlockPlacement | null {
  const remaining = rows.filter((row) => row.id !== draggedId)
  const next = remaining.find((row) => y < (row.top + row.bottom) / 2)
  if (next) return { targetId: next.id, after: false }
  const last = remaining.at(-1)
  return last ? { targetId: last.id, after: true } : null
}

/** undefined means invalid or unchanged; null is a valid move to the beginning. */
export function blockMoveAnchor(ids: string[], draggedId: string, placement: BlockPlacement): string | null | undefined {
  if (!ids.includes(draggedId) || draggedId === placement.targetId) return undefined
  const remaining = ids.filter((id) => id !== draggedId)
  const target = remaining.indexOf(placement.targetId)
  if (target < 0) return undefined
  const index = target + Number(placement.after)
  const reordered = [...remaining.slice(0, index), draggedId, ...remaining.slice(index)]
  if (reordered.every((id, i) => id === ids[i])) return undefined
  return index === 0 ? null : remaining[index - 1]
}
