<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { previewLabel } from '../../ai/protocol'
import type { EditAction } from '../../ai/protocol'
import { setBlockDraftPending } from '../../workspace/noteDrafts'
import type { Block } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { BLOCK_TYPE_LABELS } from '../../workspace/labels'
import BlockMenu from './BlockMenu.vue'
import MathFormula from './MathFormula.vue'
import AppIcon from '../ui/AppIcon.vue'

const props = defineProps<{
  block: Block
  active?: boolean
  preview?: EditAction | null
  canUndo?: boolean
  dragging?: boolean
  dropSide?: 'before' | 'after'
  reorderDisabled?: boolean
}>()

const emit = defineEmits<{
  activate: []
  dragStart: [event: PointerEvent]
  move: [direction: 'up' | 'down']
  undoAi: []
}>()

const { updateBlock } = useWorkspaceActions()

const root = ref<HTMLElement | null>(null)
const title = ref('')
const content = ref('')
const extra = ref('')
const focused = ref(false)
const dirty = ref(false)
const saving = ref(false)
watch([dirty, saving], () => setBlockDraftPending(props.block.id, dirty.value || saving.value), { flush: 'sync' })

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveToken = 0

const sourceLabel = computed(() => {
  const source = props.block.metadata.source
  if (source === 'ai') return 'AI'
  if (source === 'import') return 'Import'
  return 'You'
})

function readFromBlock(): void {
  title.value = 'title' in props.block.data ? (props.block.data.title ?? '') : ''
  extra.value = ''
  switch (props.block.type) {
    case 'math':
      content.value = props.block.data.latex
      extra.value = props.block.data.explanation ?? ''
      break
    case 'code':
      content.value = props.block.data.code
      extra.value = props.block.data.language
      break
    case 'exploration':
      content.value = props.block.data.items.join('\n')
      break
    default:
      content.value = props.block.data.content
  }
  dirty.value = false
}

readFromBlock()

watch(
  () => props.block.id,
  () => {
    clearSaveTimer()
    readFromBlock()
  },
)

watch(
  () => [props.block.metadata.updatedAt, props.block.type, props.block.data],
  () => {
    if (!dirty.value && !saving.value) readFromBlock()
  },
)

function clearSaveTimer(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function markDirty(): void {
  dirty.value = true
  scheduleSave()
}

function scheduleSave(): void {
  clearSaveTimer()
  saveTimer = setTimeout(() => {
    void persist()
  }, 450)
}

function buildChanges() {
  switch (props.block.type) {
    case 'math':
      return {
        data: {
          title: title.value,
          latex: content.value,
          explanation: extra.value,
        },
      }
    case 'code':
      return {
        data: {
          title: title.value,
          code: content.value,
          language: extra.value.trim() || 'text',
        },
      }
    case 'exploration':
      return {
        data: {
          title: title.value,
          items: content.value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        },
      }
    default:
      return {
        data: {
          title: title.value,
          content: content.value,
        },
      }
  }
}

function sameAsStored(): boolean {
  switch (props.block.type) {
    case 'math':
      return (
        (props.block.data.title ?? '') === title.value &&
        props.block.data.latex === content.value &&
        (props.block.data.explanation ?? '') === extra.value
      )
    case 'code':
      return (
        (props.block.data.title ?? '') === title.value &&
        props.block.data.code === content.value &&
        (props.block.data.language || 'text') === (extra.value.trim() || 'text')
      )
    case 'exploration': {
      const items = content.value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
      const stored = props.block.data.items
      return (
        (props.block.data.title ?? '') === title.value &&
        stored.length === items.length &&
        stored.every((item, index) => item === items[index])
      )
    }
    default:
      return (
        (('title' in props.block.data ? props.block.data.title : undefined) ?? '') === title.value &&
        props.block.data.content === content.value
      )
  }
}

async function persist(): Promise<void> {
  if (!dirty.value || sameAsStored()) {
    dirty.value = false
    return
  }
  const token = ++saveToken
  saving.value = true
  try {
    await updateBlock(props.block.id, buildChanges())
    if (token !== saveToken) return
    if (sameAsStored()) dirty.value = false
    else scheduleSave()
  } finally {
    if (token === saveToken) saving.value = false
  }
}

function resizeTextareas(): void {
  root.value?.querySelectorAll('textarea').forEach((el) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  })
}
onMounted(resizeTextareas)
watch([content, extra], async () => { await nextTick(); resizeTextareas() })

function autoGrow(event: Event): void {
  const el = event.target
  if (!(el instanceof HTMLTextAreaElement)) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onInput(event: Event): void {
  autoGrow(event)
  markDirty()
}

function onFocus(): void {
  focused.value = true
  emit('activate')
}

// The header is a larger drag surface than the six-dot affordance. Buttons in
// the header keep their own click behavior (menu, undo, and keyboard handle).
function onHeaderPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Element && target.closest('button')) return
  emit('dragStart', event)
}

async function onBlur(): Promise<void> {
  focused.value = false
  clearSaveTimer()
  await persist()
}


onBeforeUnmount(() => {
  clearSaveTimer()
  if (dirty.value) void persist().finally(() => setBlockDraftPending(props.block.id, false))
  else setBlockDraftPending(props.block.id, false)
})

const statusText = computed(() => {
  if (saving.value) return 'Saving…'
  if (dirty.value) return 'Editing'
  return sourceLabel.value
})
</script>

<template>
  <article
    ref="root"
    class="block"
    :class="[`type-${block.type}`, { active, dragging, [`drop-${dropSide}`]: dropSide, preview: Boolean(preview), [`preview-${preview}`]: preview }]"
    :data-block-id="block.id"
  >
    <header class="head" @pointerdown="onHeaderPointerDown">
      <button
        type="button" class="grip" :disabled="reorderDisabled"
        :aria-label="`拖动排序：${title || '未命名 Block'}`" title="拖动调整位置，也可用 ↑ / ↓ 移动"
        aria-keyshortcuts="ArrowUp ArrowDown"
        @pointerdown.stop="emit('dragStart', $event)" @dragstart.prevent @click.stop
        @keydown.up.prevent="emit('move', 'up')" @keydown.down.prevent="emit('move', 'down')"
      ><AppIcon name="grip" /></button>
      <div class="meta">
        <span class="badge">{{ BLOCK_TYPE_LABELS[block.type] }}</span>
        <span v-if="preview" class="status preview-tag">待{{ previewLabel(preview) }}</span>
        <span v-else class="status">{{ statusText }}</span>
      </div>
      <div class="head-actions">
        <button v-if="canUndo" type="button" class="undo-ai" @click.stop="emit('undoAi')">撤销此块</button>
        <BlockMenu :block="block" @click.stop />
      </div>
    </header>

    <input
      v-model="title"
      class="title"
      type="text"
      placeholder="Untitled"
      @focus="onFocus"
      @input="markDirty"
      @blur="onBlur"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />

    <div v-if="block.type === 'math'" class="math-stage">
      <MathFormula :latex="content" />
      <textarea
        v-model="content"
        class="field latex-field"
        rows="2"
        placeholder="LaTeX formula"
        spellcheck="false"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      />
      <textarea
        v-model="extra"
        class="field explanation"
        rows="2"
        placeholder="Explain the formula…"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      />
    </div>

    <div v-else-if="block.type === 'code'" class="code-stage">
      <input
        v-model="extra"
        class="lang"
        type="text"
        placeholder="language"
        @focus="onFocus"
        @input="markDirty"
        @blur="onBlur"
      />
      <textarea
        v-model="content"
        class="code-field"
        rows="4"
        placeholder="Write code…"
        spellcheck="false"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      />
    </div>

    <div v-else-if="block.type === 'exploration'" class="explore-stage">
      <textarea
        v-model="content"
        class="field explore-field"
        rows="3"
        placeholder="One question per line…"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      />
    </div>

    <textarea
      v-else
      v-model="content"
      class="field body"
      :class="block.type"
      rows="3"
      placeholder="Write here…"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    />
  </article>
</template>

<style scoped>
.block {
  position: relative;
  /* Every block is a card; type-specific content can still use an inset tint. */
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem 0.7rem 0.7rem 1.35rem;
  box-shadow: 0 1px 2px rgb(28 25 23 / 4%);
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
}

.block:hover,
.block.active {
  background: var(--panel);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
  box-shadow: 0 4px 12px rgb(28 25 23 / 6%);
}

.grip {
  --icon-size: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  margin-left: -6px;
  border: 0;
  border-radius: var(--control-radius);
  background: transparent;
  color: var(--muted);
  cursor: grab;
  padding: 0;
  user-select: none;
  touch-action: none;
}
.grip:hover:not(:disabled), .grip:focus-visible { color: var(--accent); background: var(--control-hover); }
.grip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.grip:disabled { opacity: .4; cursor: default; }
.grip:active { cursor: grabbing; }
.block.dragging { opacity: .4; }
.block.drop-before::before, .block.drop-after::after { content: ''; position: absolute; left: 0; right: 0; height: 3px; border-radius: 3px; background: var(--accent); pointer-events: none; }
.block.drop-before::before { top: -4px; }
.block.drop-after::after { bottom: -4px; }

.head {
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
  align-items: center;
  min-height: 1.4rem;
  touch-action: none;
  cursor: grab;
}
.head:active { cursor: grabbing; }

.meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex: 1;
}

.badge {
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
}

.type-concept .badge { color: var(--accent); }
.type-intuition .badge { color: #9a3412; }
.type-math .badge { color: #57534e; }
.type-code .badge { color: #44403c; }
.type-example .badge { color: #0f766e; }
.type-exploration .badge { color: #57534e; }

.status {
  color: #a8a29e;
  font-size: 0.7rem;
}

.title,
.field,
.code-field,
.lang {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  box-shadow: none;
  resize: none;
  color: inherit;
  font: inherit;
}

.title {
  margin: 0.2rem 0 0;
  padding: 0;
  font-family: var(--display);
  font-size: 1.2rem;
  line-height: 1.3;
  font-weight: 650;
}

.field {
  margin-top: 0.35rem;
  padding: 0;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow: hidden;
  field-sizing: content;
  min-height: 3.2em;
}

.body.concept {
  font-size: 1.02rem;
}

.body.intuition {
  font-style: italic;
  color: #44403c;
}

.body.example {
  margin-top: 0.45rem;
  padding: 0.55rem 0.7rem;
  border-left: 2px solid rgba(15, 118, 110, 0.3);
  background: rgba(247, 251, 249, 0.8);
  border-radius: 0 8px 8px 0;
}

.math-stage {
  margin-top: 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.7rem 0.75rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(231, 224, 213, 0.85);
}

.latex-field {
  margin-top: 0.15rem;
  min-height: 2.2em;
  font-family: var(--mono);
  font-size: 0.88rem;
  color: #57534e;
}

.explanation {
  min-height: 2.2em;
  color: var(--muted);
  font-size: 0.95rem;
  border-top: 1px dashed var(--line);
  padding-top: 0.55rem;
}

.code-stage {
  position: relative;
  margin-top: 0.45rem;
  border-radius: 10px;
  background: #1c1917;
  color: #f5f5f4;
  padding: 1.55rem 0.8rem 0.7rem;
}

.lang {
  position: absolute;
  top: 0.45rem;
  right: 0.65rem;
  width: auto;
  max-width: 8rem;
  text-align: right;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #a8a29e;
  font-family: var(--mono);
}

.code-field {
  margin: 0;
  min-height: 5em;
  font-family: var(--mono);
  font-size: 0.88rem;
  line-height: 1.55;
  color: #f5f5f4;
  field-sizing: content;
}

.explore-stage {
  margin-top: 0.35rem;
}

.explore-field {
  min-height: 4.2em;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(231, 224, 213, 0.8);
}

.title::placeholder,
.field::placeholder,
.code-field::placeholder,
.lang::placeholder {
  color: #a8a29e;
}

.head-actions { display: flex; align-items: center; gap: 4px; }
.undo-ai {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  padding: 0 6px;
}
.block.preview { border-color: rgba(15, 118, 110, 0.35); background: rgba(236, 253, 245, 0.5); }
.block.preview-delete { opacity: 0.55; background: rgba(254, 226, 226, 0.55); }
.preview-tag { color: var(--accent) !important; }
</style>
