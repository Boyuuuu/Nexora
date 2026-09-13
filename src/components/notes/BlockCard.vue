<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Block } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { BLOCK_TYPE_LABELS } from '../../workspace/labels'
import BlockMenu from './BlockMenu.vue'
import MathFormula from './MathFormula.vue'

const props = defineProps<{
  block: Block
  active?: boolean
}>()

const emit = defineEmits<{
  activate: []
  dropBefore: [event: DragEvent]
}>()

const { updateBlock } = useWorkspaceActions()

const title = ref('')
const content = ref('')
const extra = ref('')
const focused = ref(false)
const dirty = ref(false)
const saving = ref(false)

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
  () => props.block.metadata.updatedAt,
  () => {
    if (!focused.value && !dirty.value) readFromBlock()
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

async function onBlur(): Promise<void> {
  focused.value = false
  clearSaveTimer()
  await persist()
}

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/nexora-block', props.block.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  emit('dropBefore', event)
}

onBeforeUnmount(() => {
  clearSaveTimer()
  if (dirty.value) void persist()
})

const statusText = computed(() => {
  if (saving.value) return 'Saving…'
  if (dirty.value) return 'Editing'
  return sourceLabel.value
})
</script>

<template>
  <article
    class="block"
    :class="[`type-${block.type}`, { active }]"
    :data-block-id="block.id"
    @dragover.prevent
    @drop="onDrop"
  >
    <div
      class="grip"
      draggable="true"
      title="Drag to move"
      @dragstart="onDragStart"
      @click.stop
    >
      ⋮⋮
    </div>

    <header class="head">
      <div class="meta">
        <span class="badge">{{ BLOCK_TYPE_LABELS[block.type] }}</span>
        <span class="status">{{ statusText }}</span>
      </div>
      <BlockMenu :block="block" @click.stop />
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
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 0.55rem 0.7rem 0.7rem 1.35rem;
  transition: background 140ms ease, border-color 140ms ease;
}

.block:hover,
.block.active {
  background: rgba(255, 253, 248, 0.72);
  border-color: rgba(231, 224, 213, 0.9);
}

.block:hover .grip,
.block.active .grip {
  opacity: 1;
}

.grip {
  position: absolute;
  left: 0.15rem;
  top: 0.7rem;
  width: 1.1rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  letter-spacing: -0.05em;
  font-size: 0.75rem;
  line-height: 1;
  cursor: grab;
  opacity: 0;
  padding: 0.2rem 0;
  user-select: none;
}

.grip:active {
  cursor: grabbing;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  min-height: 1.4rem;
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
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
</style>
