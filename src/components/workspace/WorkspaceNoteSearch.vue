<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { blockBody, blockTitle } from '../../workspace/labels'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; selected: [] }>()
const { store, openNote } = useWorkspaceActions()
const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const openingId = ref<string | null>(null)
const error = ref('')

const documents = computed(() => store.notes.value
  .filter((note) => note.workspaceId === store.workspace.value?.id)
  .map((note) => {
    const body = note.blocks.map((block) => [
      blockTitle(block),
      blockBody(block),
      block.type === 'math' ? block.data.explanation ?? '' : '',
    ].join(' ')).join(' ').replace(/\s+/g, ' ').trim()
    return { id: note.id, title: note.title, body }
  }))

const results = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return documents.value
    .filter((note) => !term || `${note.title}\n${note.body}`.toLocaleLowerCase().includes(term))
    .map((note) => {
      const match = term ? note.body.toLocaleLowerCase().indexOf(term) : 0
      const start = Math.max(0, match - 32)
      const excerpt = note.body.slice(start, start + 140)
      return {
        ...note,
        excerpt: `${start ? '…' : ''}${excerpt}${note.body.length > start + 140 ? '…' : ''}`,
      }
    })
})

watch(() => props.open, async (open) => {
  if (!open) {
    dialog.value?.close()
    return
  }
  query.value = ''
  error.value = ''
  await nextTick()
  if (!props.open || !dialog.value) return
  dialog.value.showModal()
  input.value?.focus()
}, { flush: 'post' })

onBeforeUnmount(() => dialog.value?.close())

function close(): void {
  emit('close')
}

function onBackdrop(event: MouseEvent): void {
  const element = dialog.value
  if (!element || event.target !== element) return
  const bounds = element.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}

function resultButtons(): HTMLButtonElement[] {
  return [...(dialog.value?.querySelectorAll<HTMLButtonElement>('[data-note-result]:not(:disabled)') ?? [])]
}

function onDialogKey(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const controls = dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
  const first = controls?.[0]
  const last = controls?.[controls.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function focusResult(last = false): void {
  const buttons = resultButtons()
  buttons[last ? buttons.length - 1 : 0]?.focus()
}

function onResultKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const buttons = resultButtons()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  const next = index + (event.key === 'ArrowDown' ? 1 : -1)
  if (next < 0) input.value?.focus()
  else buttons[Math.min(next, buttons.length - 1)]?.focus()
}

async function selectNote(id: string): Promise<void> {
  if (openingId.value || !documents.value.some((note) => note.id === id)) return
  openingId.value = id
  error.value = ''
  try {
    await openNote(id)
    if (store.lastError.value || store.note.value?.id !== id) {
      error.value = '暂时无法打开这篇笔记，请重试。'
      return
    }
    emit('selected')
  } catch {
    error.value = '暂时无法打开这篇笔记，请重试。'
  } finally {
    openingId.value = null
  }
}

function onSearchKey(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    focusResult(event.key === 'ArrowUp')
  } else if (event.key === 'Enter' && results.value[0]) {
    event.preventDefault()
    void selectNote(results.value[0].id)
  }
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="note-search"
      aria-labelledby="note-search-title"
      aria-describedby="note-search-scope"
      @cancel.prevent="close"
      @click="onBackdrop"
      @keydown="onDialogKey"
    >
      <header class="search-head">
        <div class="search-heading">
          <h2 id="note-search-title">搜索 Notes</h2>
          <p id="note-search-scope">当前工作区 · {{ store.workspace.value?.metadata.name ?? '尚未选择工作区' }}</p>
        </div>
        <IconButton icon="close" label="关闭搜索" tooltip-align="end" @click="close" />
      </header>

      <div class="search-field">
        <AppIcon name="search" />
        <input
          ref="input"
          v-model="query"
          type="search"
          aria-label="搜索当前工作区的笔记"
          aria-controls="note-search-results"
          placeholder="搜索笔记标题或内容…"
          autocomplete="off"
          @keydown="onSearchKey"
        />
        <kbd aria-hidden="true">Esc</kbd>
      </div>

      <p class="result-count" role="status" aria-live="polite">
        {{ query.trim() ? `找到 ${results.length} 篇笔记` : `当前工作区的笔记 · ${results.length}` }}
      </p>
      <div id="note-search-results" class="results nexora-scroll" :aria-busy="Boolean(openingId)" @keydown="onResultKey">
        <ul v-if="results.length" aria-label="笔记搜索结果">
          <li v-for="note in results" :key="note.id">
            <button
              type="button"
              class="note-result"
              data-note-result
              :disabled="Boolean(openingId)"
              :aria-label="`打开笔记：${note.title || 'Untitled'}`"
              @click="selectNote(note.id)"
            >
              <AppIcon name="note" />
              <span class="result-text">
                <strong>{{ note.title || 'Untitled' }}</strong>
                <span>{{ note.excerpt || '这篇笔记还没有内容' }}</span>
              </span>
              <span class="result-arrow" aria-hidden="true">↗</span>
            </button>
          </li>
        </ul>
        <div v-else class="empty-results">
          <AppIcon name="search" />
          <strong>{{ query.trim() ? '没有找到相关笔记' : '当前工作区还没有笔记' }}</strong>
          <p>{{ query.trim() ? '试试其他关键词，或检查笔记是否在当前工作区。' : '创建笔记后，就可以在这里搜索。' }}</p>
        </div>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <footer class="search-footer">搜索仅限当前工作区 · 点击结果打开笔记</footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.note-search {
  width: min(560px, calc(100vw - 32px));
  max-height: min(600px, calc(100dvh - 48px));
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--panel);
  color: var(--ink);
  box-shadow: 0 24px 80px rgba(28, 25, 23, 0.18);
}

.note-search[open] {
  display: flex;
  flex-direction: column;
  animation: search-enter var(--panel-duration) var(--panel-easing);
}

.note-search::backdrop {
  background: rgba(28, 25, 23, 0.3);
}

.search-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 20px 20px 16px;
}

.search-heading {
  min-width: 0;
}

.search-heading h2 {
  font: 600 18px/1.4 var(--sans);
}

.search-heading p {
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 13px;
}

.search-field {
  display: flex;
  align-items: center;
  flex: none;
  gap: 10px;
  margin: 0 20px;
  padding: 0 12px;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--control-radius);
  background: #fff;
  color: var(--muted);
}

.search-field:focus-within {
  border-color: var(--accent);
  outline: 2px solid color-mix(in srgb, var(--accent) 12%, transparent);
}

.search-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  padding: 10px 0;
  background: transparent;
  color: var(--ink);
  font: 15px/1.5 var(--sans);
}

kbd {
  font: 11px/1 var(--sans);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 4px;
}

.result-count {
  flex: none;
  margin: 18px 24px 8px;
  color: var(--muted);
  font-size: 12px;
}

.results {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 12px 12px;
}

.results ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.note-result {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: var(--control-radius);
  background: transparent;
  text-align: left;
}

.note-result > .app-icon,
.result-arrow {
  color: var(--muted);
}

.note-result:hover:not(:disabled),
.note-result:focus-visible {
  background: var(--control-hover);
}

.note-result:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.result-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.result-text strong {
  font-size: 15px;
  font-weight: 600;
}

.result-text span {
  color: var(--muted);
  font-size: 13px;
}

.result-text strong,
.result-text span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.empty-results .app-icon {
  color: var(--muted);
}

.empty-results p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.error {
  margin: 0;
  padding: 8px 24px;
  color: var(--bad);
  font-size: 13px;
}

.search-footer {
  flex: none;
  padding: 12px 24px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}

@keyframes search-enter {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
