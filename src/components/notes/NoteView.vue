<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { useAiEditor } from '../../composables/useAiEditor'
import { useAiSession } from '../../ai/session'
import { previewLabel } from '../../ai/protocol'
import AddBlockButton from './AddBlockButton.vue'
import BlockCard from './BlockCard.vue'
import NoteHeader from './NoteHeader.vue'
import QuoteToolbar from './QuoteToolbar.vue'
import AppIcon from '../ui/AppIcon.vue'
import { blockMoveAnchor, blockPlacementAt, type BlockPlacement } from '../../workspace/blockReorder'

const { store, ui, reorderBlock } = useWorkspaceActions()
const editor = useAiEditor()
const session = useAiSession()

const root = ref<HTMLElement | null>(null)
const draggedId = ref<string | null>(null)
const dropTarget = ref<BlockPlacement | null>(null)
const savingOrder = ref(false)
const reorderDisabled = computed(() => savingOrder.value || editor.phase.value === 'applying')
const dragPoint = ref({ x: 0, y: 0 })
const draggedTitle = computed(() => store.blocks.value.find((block) => block.id === draggedId.value)?.data.title || 'Block')
let sourceBlockId: string | null = null
let pointerId: number | null = null
let handle: HTMLElement | null = null
let startPoint = { x: 0, y: 0 }
let originNoteId: string | null = null
let scrollFrame = 0
let pointer: { x: number; y: number } | null = null

function endDrag(): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', endDrag)
  window.removeEventListener('keydown', onDragKey)
  window.removeEventListener('blur', endDrag)
  if (pointerId !== null && handle?.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
  pointerId = null
  handle = null
  sourceBlockId = null
  cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
  pointer = null
  draggedId.value = null
  dropTarget.value = null
  originNoteId = null
}

function updateDropTarget(x: number, y: number): void {
  const list = root.value, id = draggedId.value
  if (!list || !id || store.note.value?.id !== originNoteId) return
  const bounds = list.getBoundingClientRect()
  const main = list.closest('main')?.getBoundingClientRect()
  if (x < bounds.left || x > bounds.right || (main && (y < main.top || y > main.bottom))) {
    dropTarget.value = null
    return
  }
  const rows = [...list.querySelectorAll<HTMLElement>('[data-block-id]')].map((el) => {
    const rect = el.getBoundingClientRect()
    return { id: el.dataset.blockId!, top: rect.top, bottom: rect.bottom }
  })
  const target = blockPlacementAt(rows, id, y)
  dropTarget.value = target && blockMoveAnchor(rows.map((row) => row.id), id, target) !== undefined ? target : null
}

function autoScroll(): void {
  if (!draggedId.value) return
  const main = root.value?.closest('main')
  if (main && pointer) {
    const rect = main.getBoundingClientRect()
    if (pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom) {
      const edge = Math.min(64, rect.height / 4)
      const speed = pointer.y < rect.top + edge ? -12 * (1 - (pointer.y - rect.top) / edge)
        : pointer.y > rect.bottom - edge ? 12 * (1 - (rect.bottom - pointer.y) / edge) : 0
      if (speed) {
        main.scrollBy({ top: speed, behavior: 'instant' })
        updateDropTarget(pointer.x, pointer.y)
      }
    }
  }
  scrollFrame = requestAnimationFrame(autoScroll)
}

function startDrag(id: string, event: PointerEvent): void {
  if (event.button !== 0 || reorderDisabled.value || !store.note.value) return
  endDrag()
  event.preventDefault()
  handle = event.currentTarget as HTMLElement
  handle.focus({ preventScroll: true })
  handle.setPointerCapture(event.pointerId)
  pointerId = event.pointerId
  originNoteId = store.note.value.id
  sourceBlockId = id
  startPoint = { x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', endDrag)
  window.addEventListener('keydown', onDragKey)
  window.addEventListener('blur', endDrag)
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerId !== pointerId || !sourceBlockId) return
  if (!draggedId.value) {
    if (Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y) < 5) return
    draggedId.value = sourceBlockId
    scrollFrame = requestAnimationFrame(autoScroll)
  }
  event.preventDefault()
  pointer = { x: event.clientX, y: event.clientY }
  dragPoint.value = { x: Math.min(event.clientX + 14, window.innerWidth - 260), y: Math.min(event.clientY + 14, window.innerHeight - 50) }
  updateDropTarget(event.clientX, event.clientY)
}

function onDragKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); endDrag() }
}

async function saveMove(id: string, target: BlockPlacement, noteId: string): Promise<void> {
  if (reorderDisabled.value) return
  savingOrder.value = true
  try { await reorderBlock(id, target, noteId) }
  finally { savingOrder.value = false }
}

async function onPointerUp(event: PointerEvent): Promise<void> {
  if (event.pointerId !== pointerId) return
  if (draggedId.value) updateDropTarget(event.clientX, event.clientY)
  const id = draggedId.value, target = dropTarget.value, noteId = originNoteId
  endDrag()
  if (id && target && noteId) await saveMove(id, target, noteId)
}

async function moveByKeyboard(id: string, direction: 'up' | 'down'): Promise<void> {
  if (reorderDisabled.value || sourceBlockId) return
  const index = store.blocks.value.findIndex((block) => block.id === id)
  const neighbor = store.blocks.value[index + (direction === 'up' ? -1 : 1)]
  if (index < 0 || !neighbor || !store.note.value) return
  const noteId = store.note.value.id
  const focusedHandle = document.activeElement
  await saveMove(id, { targetId: neighbor.id, after: direction === 'down' }, noteId)
  await nextTick()
  // Moving a DOM node can drop keyboard focus; keep repeated arrow presses on this block.
  if (store.note.value?.id !== noteId || (document.activeElement !== document.body && document.activeElement !== focusedHandle)) return
  const row = [...(root.value?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [])].find((el) => el.dataset.blockId === id)
  row?.querySelector<HTMLButtonElement>('.grip')?.focus({ preventScroll: true })
}

watch(() => store.note.value?.id, endDrag)
onBeforeUnmount(endDrag)
watch(() => session.focusedPreviewId.value, async (id) => {
  if (!id) return
  await nextTick()
  const block = [...(root.value?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [])].find((el) => el.dataset.blockId === id)
  block?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  session.focusedPreviewId.value = null
})

const lastId = computed(() => store.blocks.value.at(-1)?.id ?? null)

function ghostLabel(type?: string): string {
  return type ? `新增 ${type}` : '新增块'
}
</script>

<template>
  <section ref="root" class="note-view">
    <QuoteToolbar />
    <template v-if="store.note.value">
      <NoteHeader />
      <div v-if="draggedId" class="drag-preview" :style="{ left: `${dragPoint.x}px`, top: `${dragPoint.y}px` }" aria-hidden="true"><AppIcon name="grip" /><span>{{ draggedTitle }}</span></div>
      <p v-if="draggedId" class="reorder-hint" role="status">拖到目标位置后松开 · 按 Esc 取消</p>
      <div v-if="store.blocks.value.length || editor.ghostAfter(null).length" class="blocks">
        <article
          v-for="(ghost, index) in editor.ghostAfter(null)"
          :key="`ghost-head-${index}`"
          class="ghost"
        >
          {{ previewLabel(ghost.action) }} · {{ ghost.data?.title || ghostLabel(ghost.type) }}（待应用）
        </article>
        <template v-for="block in store.blocks.value" :key="block.id">
          <BlockCard
            :block="block"
            :active="ui.selectedBlockId.value === block.id"
            :preview="editor.patchFor(block.id)?.action"
            :dragging="draggedId === block.id"
            :drop-side="dropTarget?.targetId === block.id ? (dropTarget.after ? 'after' : 'before') : undefined"
            :reorder-disabled="reorderDisabled"
            :can-undo="editor.lastTask.value?.noteId === store.note.value.id && editor.lastTask.value.changes.some((item) => item.blockId === block.id)"
            @activate="ui.selectBlock(block.id)"
            @drag-start="startDrag(block.id, $event)"
            @move="moveByKeyboard(block.id, $event)"
            @undo-ai="editor.undoBlock(block.id)"
          />
          <article
            v-for="(ghost, index) in editor.ghostAfter(block.id, { last: block.id === lastId })"
            :key="`ghost-${block.id}-${index}`"
            class="ghost"
          >
            {{ previewLabel(ghost.action) }} · {{ ghost.data?.title || ghostLabel(ghost.type) }}（待应用）
          </article>
        </template>
      </div>
      <p v-else class="empty-blocks">This note has no blocks yet. Start with a concept, an intuition, or a question.</p>
      <AddBlockButton />
    </template>

    <div v-else class="empty">
      <p class="kicker">Note</p>
      <h1>Your knowledge starts here.</h1>
      <p>点击侧边栏 Notes 右侧的 ＋，创建这个工作区的第一篇笔记。</p>
    </div>
  </section>
</template>

<style scoped>
.note-view {
  max-width: 760px;
  margin: 0 auto;
  padding: 1.75rem clamp(1rem, 3vw, 1.75rem) 3.5rem;
  padding-right: clamp(1.25rem, 3.5vw, 2rem);
}

.blocks {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.drag-preview { --icon-size: 18px; position: fixed; z-index: 50; display: flex; gap: 8px; align-items: center; max-width: 240px; padding: 10px 14px; border: 1px solid var(--accent); border-radius: var(--control-radius); color: var(--accent); background: var(--panel); box-shadow: 0 8px 24px #0002; pointer-events: none; font-size: 13px; }
.drag-preview span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.reorder-hint { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 45; width: fit-content; margin: 0; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--panel); color: var(--accent); font-size: 12px; pointer-events: none; }

.ghost {
  margin: 0.15rem 0;
  padding: 0.55rem 0.75rem;
  border: 1px dashed var(--accent);
  border-radius: 10px;
  color: var(--accent);
  font-size: 13px;
  background: rgba(15, 118, 110, 0.05);
}

.empty,
.empty-blocks {
  color: var(--muted);
}

.empty {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 28rem;
}

.empty h1 {
  margin: 0.2rem 0 0;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 2.8rem);
  color: var(--ink);
}

.empty p,
.empty-blocks {
  margin: 0.7rem 0 0;
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
}

.empty-blocks {
  padding: 1rem 0.2rem;
}
</style>
