import { computed, inject, onBeforeUnmount, provide, ref, type InjectionKey } from 'vue'

export interface SidebarDragItem { kind: 'workspace' | 'note'; id: string; workspaceId: string }
interface DropTarget { item: SidebarDragItem; after: boolean }
type Move = (item: SidebarDragItem, targetId: string, after: boolean) => Promise<boolean>

function createDrag(move: Move) {
  const source = ref<SidebarDragItem | null>(null)
  const target = ref<DropTarget | null>(null)
  const saving = ref(false)
  let pending: { item: SidebarDragItem; element: HTMLElement; pointerId: number; x: number; y: number } | null = null
  let point = { x: 0, y: 0 }
  let frame = 0
  let ignoreClickUntil = 0
  const matches = (a: SidebarDragItem, b: SidebarDragItem) =>
    a.kind === b.kind && (a.kind === 'workspace' || a.workspaceId === b.workspaceId)

  function clear() {
    cancelAnimationFrame(frame)
    if (pending?.element.hasPointerCapture(pending.pointerId)) pending.element.releasePointerCapture(pending.pointerId)
    pending = null
    source.value = null
    target.value = null
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
    window.removeEventListener('keydown', cancelKey)
  }
  function end() { if (source.value) ignoreClickUntil = Date.now() + 200; clear() }
  function cancelKey(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); end() } }

  // Pointer capture works in embedded browsers as well as desktop and touch browsers.
  function start(event: PointerEvent, item: SidebarDragItem) {
    if (saving.value || event.button !== 0 || !event.isPrimary) return
    clear()
    const element = event.currentTarget as HTMLElement
    pending = { item, element, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    element.setPointerCapture(event.pointerId)
    window.addEventListener('pointermove', pointerMove, { passive: false })
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    window.addEventListener('keydown', cancelKey)
  }
  function locateTarget() {
    target.value = null
    const row = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-sort-kind]')
    if (!row || !pending?.element.closest('.sidebar')?.contains(row) || !source.value) return
    const item: SidebarDragItem = { kind: row.dataset.sortKind as SidebarDragItem['kind'], id: row.dataset.sortId!, workspaceId: row.dataset.sortWorkspace! }
    if (!matches(source.value, item) || source.value.id === item.id) return
    const bounds = row.getBoundingClientRect()
    target.value = { item, after: point.y >= bounds.top + bounds.height / 2 }
  }
  function autoScroll() {
    const scroller = pending?.element.closest<HTMLElement>('.sidebar-scroll')
    if (!source.value || !scroller) return
    const bounds = scroller.getBoundingClientRect()
    if (point.x >= bounds.left && point.x <= bounds.right) {
      const speed = point.y < bounds.top + 32 ? -7 : point.y > bounds.bottom - 32 ? 7 : 0
      if (speed) { scroller.scrollTop += speed; locateTarget() }
    }
    frame = requestAnimationFrame(autoScroll)
  }
  function pointerMove(event: PointerEvent) {
    if (!pending || event.pointerId !== pending.pointerId) return
    point = { x: event.clientX, y: event.clientY }
    if (!source.value) {
      if (Math.hypot(point.x - pending.x, point.y - pending.y) < 6) return
      source.value = pending.item
      frame = requestAnimationFrame(autoScroll)
    }
    event.preventDefault()
    locateTarget()
  }
  async function pointerUp(event: PointerEvent) {
    if (!pending || event.pointerId !== pending.pointerId) return
    const dragged = source.value
    point = { x: event.clientX, y: event.clientY }
    locateTarget()
    const placement = target.value
    end()
    if (!dragged || !placement) return
    saving.value = true
    try { await move(dragged, placement.item.id, placement.after) } finally { saving.value = false }
  }
  async function keyboard(event: KeyboardEvent, item: SidebarDragItem, siblings: readonly string[]) {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    if (saving.value) return
    const next = siblings[siblings.indexOf(item.id) + (event.key === 'ArrowUp' ? -1 : 1)]
    if (!next) return
    saving.value = true
    try { await move(item, next, event.key === 'ArrowDown') } finally { saving.value = false }
  }
  function classes(item: SidebarDragItem) {
    return {
      dragging: source.value?.kind === item.kind && source.value.id === item.id,
      'drop-before': target.value?.item.kind === item.kind && target.value.item.id === item.id && !target.value.after,
      'drop-after': target.value?.item.kind === item.kind && target.value.item.id === item.id && target.value.after,
    }
  }
  onBeforeUnmount(clear)
  return { start, keyboard, classes, saving: computed(() => saving.value), allowClick: () => Date.now() > ignoreClickUntil }
}

const dragKey: InjectionKey<ReturnType<typeof createDrag>> = Symbol('sidebar-drag')
export function provideSidebarDrag(move: Move) {
  const drag = createDrag(move)
  provide(dragKey, drag)
  return drag
}
export function useSidebarDrag() {
  const drag = inject(dragKey)
  if (!drag) throw new Error('Sidebar drag must be used inside WorkspaceSidebar')
  return drag
}
