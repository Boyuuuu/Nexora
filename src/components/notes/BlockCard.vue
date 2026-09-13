<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Block } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { BLOCK_TYPE_LABELS, blockTitle } from '../../workspace/labels'
import BlockMenu from './BlockMenu.vue'

const props = defineProps<{
  block: Block
  editing: boolean
}>()

const emit = defineEmits<{
  edit: []
  dropBefore: [event: DragEvent]
}>()

const { updateBlock } = useWorkspaceActions()

const title = ref('')
const content = ref('')
const extra = ref('')
const firstField = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const sourceLabel = computed(() => {
  const source = props.block.metadata.source
  if (source === 'ai') return 'AI generated'
  if (source === 'import') return 'Imported'
  return 'Yours'
})

function loadDraft(): void {
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
}

watch(
  () => [props.block, props.editing] as const,
  () => {
    if (props.editing) {
      loadDraft()
      void nextTick(() => firstField.value?.focus())
    }
  },
  { immediate: true },
)

async function save(): Promise<void> {
  if (!props.editing) return

  switch (props.block.type) {
    case 'math':
      await updateBlock(props.block.id, {
        data: { title: title.value, latex: content.value, explanation: extra.value },
      })
      break
    case 'code':
      await updateBlock(props.block.id, {
        data: { title: title.value, code: content.value, language: extra.value || 'text' },
      })
      break
    case 'exploration':
      await updateBlock(props.block.id, {
        data: {
          title: title.value,
          items: content.value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        },
      })
      break
    default:
      await updateBlock(props.block.id, {
        data: { title: title.value, content: content.value },
      })
  }
}

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('text/nexora-block', props.block.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  emit('dropBefore', event)
}

const readItems = computed(() => (props.block.type === 'exploration' ? props.block.data.items : []))
</script>

<template>
  <article
    class="block"
    :class="{ editing, math: block.type === 'math', code: block.type === 'code' }"
    :draggable="!editing"
    @click="emit('edit')"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop="onDrop"
  >
    <header class="head">
      <div>
        <p class="kind">{{ BLOCK_TYPE_LABELS[block.type] }} · {{ sourceLabel }}</p>
        <h3 v-if="!editing">{{ blockTitle(block) }}</h3>
      </div>
      <BlockMenu :block="block" @click.stop />
    </header>

    <template v-if="!editing">
      <template v-if="block.type === 'math'">
        <p class="latex">{{ block.data.latex }}</p>
        <p v-if="block.data.explanation" class="body">{{ block.data.explanation }}</p>
      </template>
      <pre v-else-if="block.type === 'code'" class="code"><code>{{ block.data.code }}</code></pre>
      <ul v-else-if="block.type === 'exploration'" class="items">
        <li v-for="(item, index) in readItems" :key="index">{{ item }}</li>
      </ul>
      <p v-else class="body">{{ 'content' in block.data ? block.data.content : '' }}</p>
    </template>

    <form v-else class="editor" @click.stop @submit.prevent="save">
      <input ref="firstField" v-model="title" type="text" placeholder="Title" @keydown.enter.prevent="save" />
      <input
        v-if="block.type === 'code'"
        v-model="extra"
        type="text"
        placeholder="Language"
      />
      <textarea v-model="content" rows="5" :placeholder="block.type === 'math' ? 'LaTeX or formula' : 'Write this block'" />
      <textarea
        v-if="block.type === 'math'"
        v-model="extra"
        rows="3"
        placeholder="Explanation"
      />
      <div class="editor-actions">
        <button type="submit" class="primary">Save</button>
      </div>
    </form>
  </article>
</template>

<style scoped>
.block {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.95rem 1rem 1rem;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.block:hover {
  border-color: #ddd6c8;
  box-shadow: 0 8px 20px rgba(28, 25, 23, 0.04);
}

.block:hover :deep(.handle) {
  opacity: 1;
}

.block.editing {
  border-color: var(--accent);
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.kind {
  margin: 0;
  color: var(--muted);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 700;
}

h3 {
  margin: 0.2rem 0 0;
  font-family: var(--display);
  font-size: 1.15rem;
}

.body,
.latex {
  margin: 0.7rem 0 0;
  white-space: pre-wrap;
}

.latex,
.code {
  font-family: var(--mono);
  font-size: 0.92rem;
  background: #f6f1e8;
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
}

.code {
  margin: 0.7rem 0 0;
  overflow: auto;
}

.items {
  margin: 0.7rem 0 0;
  padding-left: 1.1rem;
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.7rem;
}

.editor input,
.editor textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font: inherit;
  background: #fff;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
