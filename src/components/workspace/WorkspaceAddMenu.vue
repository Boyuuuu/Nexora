<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'

const props = defineProps<{ disabled: boolean; visible: boolean }>()
const emit = defineEmits<{ create: []; import: [] }>()
const root = ref<HTMLElement | null>(null)
const open = ref(false)
function close(focus = false) {
  open.value = false
  if (focus) root.value?.querySelector<HTMLButtonElement>('.add-toggle')?.focus()
}
async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
}
function choose(kind: 'create' | 'import') { close(true); if (kind === 'create') emit('create'); else emit('import') }
function outside(event: MouseEvent) { if (!root.value?.contains(event.target as Node)) close() }
function focusout(event: FocusEvent) { if (!root.value?.contains(event.relatedTarget as Node | null)) close() }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); close(true) }
  if (!open.value || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}
watch(() => props.visible, (visible) => { if (!visible) close() })
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <div ref="root" class="add-menu" @keydown="keydown" @focusout="focusout">
    <IconButton icon="plus" size="compact" class="add-toggle" label="添加 Workspace" tooltip-align="end" :disabled="disabled" :aria-expanded="open" aria-haspopup="menu" @click="toggle" />
    <div v-if="open" class="menu" role="menu" aria-label="添加 Workspace">
      <button type="button" role="menuitem" @click="choose('create')"><AppIcon name="plus" />新建 Workspace</button>
      <button type="button" role="menuitem" @click="choose('import')"><AppIcon name="upload" />从外部导入</button>
    </div>
  </div>
</template>

<style scoped>
.add-menu { position: relative; flex: none; }
.add-toggle[aria-expanded="true"]::after { display: none; }
.menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; min-width: 184px; padding: 4px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 28px rgba(28, 25, 23, 0.08); }
.menu button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; font: 13px/1.5 var(--sans); white-space: nowrap; }
.menu .app-icon { --icon-size: 16px; color: var(--muted); }
.menu button:hover, .menu button:focus-visible { background: var(--control-hover); }
.menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
