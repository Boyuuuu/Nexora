<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Block } from '../../data'
import { ASK_AI_PROMPTS } from '../../composables/useWorkspaceUi'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { useAiEditor } from '../../composables/useAiEditor'

const props = defineProps<{ block: Block }>()

const { ui, duplicateBlock, deleteBlock, moveBlockByDirection, convertBlockToNode } =
  useWorkspaceActions()
const editor = useAiEditor()

const open = ref(false)
const askOpen = ref(false)
const root = ref<HTMLElement | null>(null)

function close(): void {
  open.value = false
  askOpen.value = false
}

function onDoc(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

function focusBlock(): void {
  ui.selectBlock(props.block.id)
  close()
  const root = document.querySelector(`[data-block-id="${props.block.id}"] .title`) as HTMLElement | null
  root?.focus()
}

async function duplicate(): Promise<void> {
  close()
  await duplicateBlock(props.block)
}

async function move(direction: 'up' | 'down'): Promise<void> {
  close()
  await moveBlockByDirection(props.block.id, direction)
}

async function remove(): Promise<void> {
  close()
  await deleteBlock(props.block.id)
}

async function convert(): Promise<void> {
  close()
  await convertBlockToNode(props.block)
}

function ask(text: string): void {
  close()
  editor.askAboutBlock(props.block.id, text)
}
</script>

<template>
  <div ref="root" class="menu-wrap">
    <button type="button" class="handle" aria-label="Block menu" @click="open = !open">⋮⋮</button>
    <div v-if="open" class="menu">
      <button type="button" @click="focusBlock">Focus</button>
      <button type="button" @click="duplicate">Duplicate</button>
      <button type="button" @click="move('up')">Move Up</button>
      <button type="button" @click="move('down')">Move Down</button>
      <button type="button" @click="convert">Convert to Node</button>
      <div class="ask">
        <button type="button" @click="askOpen = !askOpen">Ask AI</button>
        <div v-if="askOpen" class="sub">
          <button v-for="item in ASK_AI_PROMPTS" :key="item.label" type="button" @click="ask(item.text)">
            {{ item.label }}
          </button>
        </div>
      </div>
      <button type="button" class="danger" @click="remove">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.menu-wrap {
  position: relative;
}

.handle {
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 0.15rem 0.35rem;
  letter-spacing: 0.08em;
  opacity: 0;
}

.menu-wrap:hover .handle,
.handle:focus-visible {
  opacity: 1;
}

.menu,
.sub {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 8;
  min-width: 196px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.3rem;
  box-shadow: 0 10px 28px rgba(28, 25, 23, 0.08);
}

.sub {
  right: calc(100% + 6px);
  top: 0;
}

.menu button,
.sub button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.4rem 0.55rem;
  border-radius: 7px;
}

.menu button:hover,
.sub button:hover {
  background: rgba(15, 118, 110, 0.06);
}

.danger {
  color: #9f1239;
}
</style>
