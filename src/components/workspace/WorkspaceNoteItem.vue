<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { WorkspaceNoteSummary } from '../../stores/knowledgeStore'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { useSidebarDrag, type SidebarDragItem } from '../../composables/useSidebarDrag'
import AppIcon from '../ui/AppIcon.vue'
import SidebarItemMenu from './SidebarItemMenu.vue'

const props = defineProps<{ note: WorkspaceNoteSummary; active: boolean; disabled: boolean; siblings: string[] }>()
const emit = defineEmits<{ open: []; changed: [] }>()
const { renameNote, deleteNote } = useWorkspaceActions()
const drag = useSidebarDrag()
const item = computed<SidebarDragItem>(() => ({ kind: 'note', id: props.note.id, workspaceId: props.note.workspaceId }))
const renaming = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
async function startRename() {
  draft.value = props.note.title
  renaming.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
async function commitRename() {
  if (!renaming.value) return
  renaming.value = false
  const title = draft.value.trim()
  if (title && title !== props.note.title && await renameNote(props.note.id, title)) emit('changed')
}
async function remove() { if (await deleteNote(props.note.id)) emit('changed') }
</script>

<template>
  <li class="note-item" :data-note-id="note.id" :class="drag.classes(item)">
    <div class="sidebar-item-row note-row" data-sort-kind="note" :data-sort-id="note.id" :data-sort-workspace="note.workspaceId">
      <input v-if="renaming" ref="input" v-model="draft" class="rename-input" aria-label="重命名笔记" @keydown.enter.prevent="!$event.isComposing && commitRename()" @keydown.escape.prevent="renaming = false" @blur="commitRename" />
      <button v-else type="button" class="tree-button note-button sidebar-sortable" :class="{ active }" :aria-current="active ? 'page' : undefined" :title="`${note.title || 'Untitled'} · 拖动调整顺序`" :disabled="disabled" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" @click="drag.allowClick() && emit('open')" @pointerdown="!disabled && drag.start($event, item)" @dragstart.prevent @keydown="drag.keyboard($event, item, siblings)">
        <AppIcon name="note" />
        <span class="name">{{ note.title || 'Untitled' }}</span>
      </button>
      <SidebarItemMenu v-if="!renaming" :label="`${note.title || 'Untitled'} 的笔记操作`" :disabled="disabled" @rename="startRename" @delete="remove" />
    </div>
  </li>
</template>

<style scoped>
.note-item { position: relative; }
.note-row { display: flex; align-items: center; gap: 2px; min-width: 0; }
.note-button { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 36px; padding: 6px 8px; border: 0; border-radius: var(--control-radius); background: transparent; color: var(--ink); font: 13px/1.5 var(--sans); text-align: left; }
.note-button:hover:not(:disabled) { background: var(--control-hover); }
.note-button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.note-button .app-icon { color: var(--muted); }
.note-button.active { background: rgba(15, 118, 110, 0.1); color: var(--accent); font-weight: 600; }
.note-button.active .app-icon { color: inherit; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rename-input { min-width: 0; width: 100%; height: 36px; border: 1px solid var(--accent); border-radius: var(--control-radius); padding: 0 8px; font: 13px/1.5 var(--sans); background: var(--panel); color: var(--ink); }
</style>
