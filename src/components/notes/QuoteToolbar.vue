<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useAiSession } from '../../ai/session'
import { useWorkspaceUi } from '../../composables/useWorkspaceUi'
import { useKnowledgeStore } from '../../stores/knowledgeStore'

const session = useAiSession()
const ui = useWorkspaceUi()
const store = useKnowledgeStore()

let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function quote(): void {
  const toolbar = session.selectionToolbar.value
  if (!toolbar) return
  session.addQuote(toolbar.blockId, toolbar.text)
  ui.openAiPanel()
  session.hideSelectionToolbar()
  window.getSelection()?.removeAllRanges()
}

async function copy(): Promise<void> {
  const toolbar = session.selectionToolbar.value
  if (!toolbar) return
  try {
    await navigator.clipboard.writeText(toolbar.text)
    ui.showToast('已复制到剪贴板')
  } catch {
    ui.showToast('复制失败，请手动复制')
  }
}

function readFieldSelection(target: EventTarget | null): { blockId: string; text: string } | null {
  const field = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
    ? target
    : document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement
      ? document.activeElement
      : null
  if (!field) return null

  const blockEl = field.closest('[data-block-id]') as HTMLElement | null
  const blockId = blockEl?.dataset.blockId
  if (!blockId || !store.blocks.value.some((block) => block.id === blockId)) return null

  const start = field.selectionStart ?? 0
  const end = field.selectionEnd ?? 0
  if (end <= start) return null
  const text = field.value.slice(start, end).replace(/\s+/g, ' ').trim()
  if (!text) return null
  return { blockId, text }
}

function readDocumentSelection(): { blockId: string; text: string; rect: DOMRect } | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const text = selection.toString().replace(/\s+/g, ' ').trim()
  if (!text) return null

  const node = selection.anchorNode
  const el = (node instanceof Element ? node : node?.parentElement)?.closest('[data-block-id]') as HTMLElement | null
  const blockId = el?.dataset.blockId
  if (!blockId || !store.blocks.value.some((block) => block.id === blockId)) return null

  return { blockId, text, rect: selection.getRangeAt(0).getBoundingClientRect() }
}

function showToolbar(blockId: string, text: string, x: number, y: number): void {
  session.showSelectionToolbar({
    blockId,
    text,
    x: Math.min(Math.max(x, 48), window.innerWidth - 48),
    y: Math.max(12, y),
  })
}

function onMouseUp(event: MouseEvent): void {
  if (event.button !== 0) return
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.some((node) => node instanceof Element && node.closest?.('.quote-pop'))) return

  // Wait a tick so textarea/input selectionStart/End settle after mouseup.
  clearHideTimer()
  hideTimer = setTimeout(() => {
    const field = readFieldSelection(event.target)
    if (field) {
      showToolbar(field.blockId, field.text, event.clientX, event.clientY - 8)
      return
    }

    const doc = readDocumentSelection()
    if (doc) {
      const x = doc.rect.width ? doc.rect.left + doc.rect.width / 2 : event.clientX
      const y = doc.rect.height ? doc.rect.top : event.clientY - 8
      showToolbar(doc.blockId, doc.text, x, y)
      return
    }

    session.hideSelectionToolbar()
  }, 10)
}

function onMouseDown(event: MouseEvent): void {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.some((node) => node instanceof Element && node.closest?.('.quote-pop'))) return
  // Keep toolbar while dragging a new selection; hide when clicking elsewhere.
  if (event.button === 0) {
    clearHideTimer()
    hideTimer = setTimeout(() => {
      const stillSelecting = Boolean(readFieldSelection(document.activeElement) || readDocumentSelection())
      if (!stillSelecting) session.hideSelectionToolbar()
    }, 0)
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (!(event.key === 'Shift' || event.key.startsWith('Arrow'))) return
  const field = readFieldSelection(event.target)
  if (!field) return
  const active = document.activeElement
  const rect = active instanceof HTMLElement ? active.getBoundingClientRect() : null
  showToolbar(
    field.blockId,
    field.text,
    rect ? rect.left + Math.min(rect.width / 2, 120) : 80,
    rect ? rect.top : 24,
  )
}

onMounted(() => {
  document.addEventListener('mouseup', onMouseUp, true)
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('keyup', onKeyUp, true)
})

onBeforeUnmount(() => {
  clearHideTimer()
  document.removeEventListener('mouseup', onMouseUp, true)
  document.removeEventListener('mousedown', onMouseDown, true)
  document.removeEventListener('keyup', onKeyUp, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="session.selectionToolbar.value"
      class="quote-pop"
      role="toolbar"
      aria-label="选区操作"
      :style="{ left: `${session.selectionToolbar.value.x}px`, top: `${session.selectionToolbar.value.y}px` }"
    >
      <button type="button" @mousedown.prevent @click="quote">引用</button>
      <button type="button" @mousedown.prevent @click="copy">复制</button>
    </div>
  </Teleport>
</template>

<style scoped>
.quote-pop {
  position: fixed;
  z-index: 80;
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  box-shadow: 0 8px 24px rgba(28, 25, 23, 0.12);
  transform: translate(-50%, calc(-100% - 10px));
}
.quote-pop button {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
}
.quote-pop button:hover,
.quote-pop button:focus-visible {
  background: rgba(15, 118, 110, 0.1);
  color: var(--accent);
}
</style>
