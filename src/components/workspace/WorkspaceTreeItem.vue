<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Workspace } from '../../data'
import type { WorkspaceNoteSummary } from '../../stores/knowledgeStore'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import SidebarItemMenu from './SidebarItemMenu.vue'
import WorkspaceNoteItem from './WorkspaceNoteItem.vue'
import { useSidebarDrag, type SidebarDragItem } from '../../composables/useSidebarDrag'

const props = defineProps<{
  workspace: Workspace
  expanded: boolean
  notesExpanded: boolean
  navigationBusy: boolean
}>()
const emit = defineEmits<{
  toggle: []; toggleNotes: []; openNote: [id: string]; openCanvas: []; createNote: []; deleted: []
}>()
const { store, ui, renameWorkspace, deleteWorkspace } = useWorkspaceActions()
const drag = useSidebarDrag()
const dragItem = computed<SidebarDragItem>(() => ({ kind: 'workspace', id: props.workspace.id, workspaceId: props.workspace.id }))
const summaries = ref<WorkspaceNoteSummary[]>([])
const loaded = ref(false)
const loading = ref(false)
const loadError = ref(false)
const renaming = ref(false)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
let readVersion = 0
const activeWorkspace = computed(() => store.workspace.value?.id === props.workspace.id)
const branchId = computed(() => `workspace-branch-${props.workspace.id}`)
const notesId = computed(() => `workspace-notes-${props.workspace.id}`)

// Keep the active branch current after note creation, renaming, deletion, or import.
watch(() => [store.workspace.value, store.notes.value] as const, ([current, notes]) => {
  if (current?.id !== props.workspace.id || notes.length !== current.noteIds.length ||
      notes.some((note) => note.workspaceId !== current.id)) return
  readVersion++
  summaries.value = notes.map(({ id, title, workspaceId }) => ({ id, title, workspaceId }))
  loaded.value = true
  loading.value = false
  loadError.value = false
}, { immediate: true })

async function loadNotes(): Promise<void> {
  if (loading.value) return
  const version = ++readVersion
  loading.value = true
  loadError.value = false
  try {
    const notes = await store.listWorkspaceNotes(props.workspace.id)
    if (version !== readVersion) return
    summaries.value = notes
    loaded.value = true
  } catch {
    if (version === readVersion) loadError.value = true
  } finally {
    if (version === readVersion) loading.value = false
  }
}

watch(() => props.expanded && props.notesExpanded, (visible) => {
  if (visible && !loaded.value) void loadNotes()
}, { immediate: true })

watch(() => props.workspace.noteIds, () => {
  if (activeWorkspace.value) return
  loaded.value = false
  if (props.expanded && props.notesExpanded) void loadNotes()
})

onBeforeUnmount(() => {
  readVersion++
})

async function startRename(): Promise<void> {
  renaming.value = true
  renameDraft.value = props.workspace.metadata.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

async function commitRename(): Promise<void> {
  if (!renaming.value) return
  renaming.value = false
  const name = renameDraft.value.trim()
  if (name && name !== props.workspace.metadata.name) await renameWorkspace(props.workspace.id, name)
}

async function onDelete(): Promise<void> {
  await deleteWorkspace(props.workspace.id)
  if (!store.workspaces.value.some((item) => item.id === props.workspace.id)) emit('deleted')
}
</script>

<template>
  <li class="workspace-item" :data-workspace-id="workspace.id" :class="drag.classes(dragItem)">
    <div class="workspace-row sidebar-item-row" data-sort-kind="workspace" :data-sort-id="workspace.id" :data-sort-workspace="workspace.id">
      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameDraft"
        class="rename-input"
        aria-label="重命名 Workspace"
        @keydown.enter.prevent="!$event.isComposing && commitRename()"
        @keydown.escape.prevent="renaming = false"
        @blur="commitRename"
      />
      <button
        v-else
        type="button"
        class="tree-button workspace-button sidebar-sortable"
        :class="{ current: activeWorkspace }"
        :aria-expanded="expanded"
        :aria-controls="branchId"
        :title="`${workspace.metadata.name} · 拖动调整顺序`"
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        @click="drag.allowClick() && emit('toggle')"
        @pointerdown="!navigationBusy && drag.start($event, dragItem)"
        @dragstart.prevent
        @keydown="drag.keyboard($event, dragItem, store.workspaces.value.map((item) => item.id))"
      >
        <AppIcon name="chevron" class="chevron" :class="{ expanded }" />
        <span class="name">{{ workspace.metadata.name }}</span>
      </button>
      <SidebarItemMenu v-if="!renaming" :label="`${workspace.metadata.name} 的操作`" :disabled="navigationBusy" @rename="startRename" @delete="onDelete" />
    </div>

    <div v-show="expanded" :id="branchId" class="workspace-children">
      <div class="notes-row">
        <button type="button" class="tree-button notes-toggle" :aria-expanded="notesExpanded" :aria-controls="notesId" @click="emit('toggleNotes')">
          <AppIcon name="chevron" class="chevron" :class="{ expanded: notesExpanded }" />
          <AppIcon name="folder" />
          <span>Notes</span>
          <span v-if="loaded" class="count">{{ summaries.length }}</span>
        </button>
        <IconButton icon="plus" size="compact" :label="`在 ${workspace.metadata.name} 中新建笔记`" tooltip-align="end" :disabled="navigationBusy" @click="emit('createNote')" />
      </div>
      <div v-show="notesExpanded" :id="notesId" class="notes-children" :aria-busy="loading">
        <p v-if="loading" class="hint" role="status">正在加载笔记…</p>
        <div v-else-if="loadError" class="load-error" role="status">
          <span>暂时无法加载笔记</span>
          <button type="button" class="retry" @click="loadNotes">重试</button>
        </div>
        <ul v-else-if="summaries.length" class="notes-list" :aria-label="`${workspace.metadata.name} 的笔记`">
          <WorkspaceNoteItem v-for="note in summaries" :key="note.id" :note="note" :active="activeWorkspace && ui.mode.value === 'note' && store.note.value?.id === note.id" :disabled="navigationBusy" :siblings="summaries.map((item) => item.id)" @open="emit('openNote', note.id)" @changed="loadNotes" />
        </ul>
        <p v-else class="hint">暂无笔记</p>
      </div>
      <button
        type="button"
        class="tree-button canvas-button"
        :class="{ active: activeWorkspace && ui.mode.value === 'canvas' }"
        :aria-current="activeWorkspace && ui.mode.value === 'canvas' ? 'page' : undefined"
        :disabled="navigationBusy"
        @click="emit('openCanvas')"
      >
        <AppIcon name="canvas" />
        <span>KnowledgeCanvas</span>
      </button>
    </div>
  </li>
</template>

<style scoped>
.workspace-item { --icon-size: 16px; position: relative; margin-bottom: 4px; }
.workspace-row, .notes-row { display: flex; align-items: center; gap: 2px; min-width: 0; }
.tree-button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 36px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--control-radius);
  background: transparent;
  color: var(--ink);
  font: 14px/1.5 var(--sans);
  text-align: left;
}
.tree-button:hover:not(:disabled) { background: var(--control-hover); }
.tree-button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.workspace-button, .notes-toggle { flex: 1; }
.workspace-button { font-weight: 600; color: var(--muted); }
.workspace-button.current { color: var(--ink); }
.tree-button .app-icon { color: var(--muted); }
.tree-button.active { background: rgba(15, 118, 110, 0.1); color: var(--accent); font-weight: 600; }
.tree-button.active .app-icon { color: inherit; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chevron { --icon-size: 12px; transition: transform var(--panel-duration) var(--panel-easing); }
.chevron.expanded { transform: rotate(90deg); }
.workspace-children { margin: 2px 0 10px 13px; padding-left: 7px; border-left: 1px solid var(--line); }
.notes-children { margin: 0 0 2px 15px; padding-left: 7px; border-left: 1px solid var(--line); }
.notes-list { list-style: none; margin: 0; padding: 0; }
.canvas-button { padding-left: 26px; white-space: nowrap; }
.count { margin-left: auto; color: var(--muted); font-size: 11px; }
.hint { margin: 0; padding: 8px; color: var(--muted); font-size: 12px; }
.load-error { padding: 8px; color: var(--muted); font-size: 12px; }
.retry { margin-left: 4px; padding: 2px 6px; font-size: 12px; }
.rename-input { min-width: 0; width: 100%; height: 36px; border: 1px solid var(--accent); border-radius: var(--control-radius); padding: 0 8px; font: 14px/1.5 var(--sans); background: var(--panel); color: var(--ink); }
</style>
