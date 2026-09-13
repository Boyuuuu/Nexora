<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import IconButton from '../ui/IconButton.vue'

defineProps<{ label: string; disabled?: boolean }>()
const emit = defineEmits<{ rename: []; delete: [] }>()
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const above = ref(false)
async function toggle() {
  open.value = !open.value
  if (!open.value) return
  const rect = root.value?.getBoundingClientRect()
  above.value = !!rect && rect.bottom + 100 > window.innerHeight
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>('.menu button')?.focus()
}
function close(focus = false) {
  open.value = false
  if (focus) root.value?.querySelector<HTMLButtonElement>('.more')?.focus()
}
function choose(action: 'rename' | 'delete') { close(true); if (action === 'rename') emit('rename'); else emit('delete') }
function outside(event: MouseEvent) { if (!root.value?.contains(event.target as Node)) close() }
function focusout(event: FocusEvent) { if (!root.value?.contains(event.relatedTarget as Node | null)) close() }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); close(true) }
  if (!open.value || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('.menu button') ?? [])]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <div ref="root" class="row-actions" @keydown="keydown" @focusout="focusout" @dragstart.prevent.stop>
    <IconButton icon="more" size="compact" class="more" :class="{ visible: open }" :label="label" tooltip-align="end" :aria-expanded="open" aria-haspopup="menu" :disabled="disabled" @click.stop="toggle" />
    <div v-if="open" class="menu" :class="{ above }" role="menu" :aria-label="label">
      <button type="button" role="menuitem" @click="choose('rename')">Rename</button>
      <button type="button" role="menuitem" class="danger" @click="choose('delete')">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.row-actions { position: relative; flex: none; }
.more { opacity: 0; }
.more[aria-expanded="true"]::after { display: none; }
:global(.sidebar-item-row:hover .more), :global(.sidebar-item-row:focus-within .more), .more.visible { opacity: 1; }
.menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 12; min-width: 120px; padding: 4px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 28px rgba(28, 25, 23, 0.08); }
.menu.above { top: auto; bottom: calc(100% + 4px); }
.menu button { display: block; width: 100%; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; text-align: left; font: 13px/1.5 var(--sans); }
.menu button:hover, .menu button:focus-visible { background: var(--control-hover); }
.menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.menu .danger { color: var(--bad); }
@media (hover: none) { .more { opacity: 1; } }
</style>
