/** Move one existing sibling before/after another without changing membership. */
export function moveRelative(ids: readonly string[], id: string, targetId: string, after: boolean): string[] {
  if (!ids.includes(id) || !ids.includes(targetId)) {
    throw new Error('The dragged item or its target no longer exists')
  }
  if (id === targetId) return [...ids]
  const next = ids.filter((item) => item !== id)
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, id)
  return next
}
