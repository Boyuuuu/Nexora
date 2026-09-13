<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import WorkspaceTreeItem from './WorkspaceTreeItem.vue'
import WorkspaceTestTools from './WorkspaceTestTools.vue'
import WorkspaceAddMenu from './WorkspaceAddMenu.vue'
import { provideSidebarDrag } from '../../composables/useSidebarDrag'

const emit = defineEmits<{ search: []; navigate: [] }>()
const { store, ui, createWorkspace, createWorkspaceNote, openWorkspaceNote, openWorkspaceCanvas, moveWorkspace, moveWorkspaceNote } = useWorkspaceActions()
const drag = provideSidebarDrag((item, targetId, after) => item.kind === 'workspace'
  ? moveWorkspace(item.id, targetId, after)
  : moveWorkspaceNote(item.workspaceId, item.id, targetId, after))
const TREE_KEY = 'nexora.sidebar.tree'
interface TreeState {
  root: boolean
  workspaces: Record<string, boolean>
  notes: Record<string, boolean>
}

function readTree(): TreeState {
  const defaults: TreeState = { root: true, workspaces: {}, notes: {} }
  try {
    const saved = JSON.parse(localStorage.getItem(TREE_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    if (typeof saved.root === 'boolean') defaults.root = saved.root
    for (const key of ['workspaces', 'notes'] as const) {
      if (!saved[key] || typeof saved[key] !== 'object' || Array.isArray(saved[key])) continue
      defaults[key] = Object.fromEntries(Object.entries(saved[key]).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>
    }
  } catch { /* Use the initial tree when saved preferences are unavailable. */ }
  return defaults
}

const tree = reactive(readTree())
const creating = ref(false)
const createDraft = ref('')
const createInput = ref<HTMLInputElement | null>(null)
const navigating = ref(false)

watch(tree, (value) => {
  try { localStorage.setItem(TREE_KEY, JSON.stringify(value)) } catch { /* Preferences are optional. */ }
}, { deep: true })

watch(() => store.workspace.value?.id, (id) => {
  if (id && tree.workspaces[id] === undefined) tree.workspaces[id] = true
}, { immediate: true })

function toggleWorkspace(id: string): void {
  tree.workspaces[id] = !tree.workspaces[id]
}

function toggleNotes(id: string): void {
  tree.notes[id] = !(tree.notes[id] ?? true)
}

async function navigate(action: () => Promise<boolean>): Promise<void> {
  if (navigating.value) return
  navigating.value = true
  try {
    if (await action()) emit('navigate')
  } catch {
    ui.showToast('暂时无法打开内容，请重试。')
  } finally {
    navigating.value = false
  }
}

async function onCreateNote(workspaceId: string): Promise<void> {
  tree.workspaces[workspaceId] = true
  tree.notes[workspaceId] = true
  await navigate(() => createWorkspaceNote(workspaceId))
}

async function startCreate(): Promise<void> {
  tree.root = true
  creating.value = true
  createDraft.value = ''
  await nextTick()
  createInput.value?.focus()
}

async function commitCreate(): Promise<void> {
  if (!creating.value || navigating.value) return
  const name = createDraft.value.trim()
  creating.value = false
  if (!name) return
  await navigate(async () => {
    await createWorkspace(name)
    const created = store.workspace.value
    if (!created || store.lastError.value) return false
    tree.workspaces[created.id] = true
    tree.notes[created.id] = true
    return true
  })
}

function forgetWorkspace(id: string): void {
  delete tree.workspaces[id]
  delete tree.notes[id]
}
</script>

<template>
  <aside class="sidebar" aria-label="工作区侧边栏">
    <header class="sidebar-head">
      <RouterLink class="brand" to="/" aria-label="Nexora 知域">
        <span class="mark" aria-hidden="true">N</span>
        <span><strong>Nexora</strong><small>知域</small></span>
      </RouterLink>
      <IconButton icon="search" label="搜索 Notes" tooltip-align="end" aria-haspopup="dialog" @click="emit('search')" />
    </header>

    <div class="sidebar-scroll nexora-scroll">
      <div class="section-head">
        <button class="section-toggle" type="button" :aria-expanded="tree.root" aria-controls="workspace-tree" @click="tree.root = !tree.root">
          <AppIcon name="chevron" class="chevron" :class="{ expanded: tree.root }" />
          <span>Workspace</span>
        </button>
        <WorkspaceAddMenu :disabled="navigating || store.busy.value" :visible="ui.isSidebarOpen.value" @create="startCreate" @import="ui.openTransfer('import')" />
      </div>

      <div v-show="tree.root" id="workspace-tree">
        <div v-if="creating" class="create-row">
          <input
            ref="createInput"
            v-model="createDraft"
            class="create-input"
            aria-label="Workspace 名称"
            placeholder="Workspace 名称"
            @keydown.enter.prevent="!$event.isComposing && commitCreate()"
            @keydown.escape.prevent="creating = false"
            @blur="commitCreate"
          />
        </div>
        <ul v-if="store.workspaces.value.length" class="workspace-list" aria-label="工作区目录">
          <WorkspaceTreeItem
            v-for="item in store.workspaces.value"
            :key="item.id"
            :workspace="item"
            :expanded="tree.workspaces[item.id] ?? false"
            :notes-expanded="tree.notes[item.id] ?? true"
            :navigation-busy="navigating || store.busy.value || drag.saving.value"
            @toggle="toggleWorkspace(item.id)"
            @toggle-notes="toggleNotes(item.id)"
            @open-note="(id) => navigate(() => openWorkspaceNote(item.id, id))"
            @open-canvas="navigate(() => openWorkspaceCanvas(item.id))"
            @create-note="onCreateNote(item.id)"
            @deleted="forgetWorkspace(item.id)"
          />
        </ul>
        <p v-else-if="!creating" class="empty">点击右侧的 ＋ 创建 Workspace</p>
      </div>
    </div>
    <footer class="sidebar-footer"><WorkspaceTestTools /></footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--line);
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  height: 52px;
  gap: 8px;
  padding: 0 calc(var(--workspace-gutter) + var(--control-size) + 4px) 0 var(--workspace-gutter);
}
.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 12px 24px;
}
.sidebar-footer { flex: none; padding: 4px 12px 10px; }
.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}
.mark {
  flex: none;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--display);
  font-weight: 700;
}
.brand strong, .brand small { display: block; line-height: 1.15; }
.brand strong { font-family: var(--display); }
.brand small { color: var(--muted); font-size: 0.75rem; }
.section-head { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.section-toggle {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 6px;
  min-height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--control-radius);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}
.section-toggle:hover { background: var(--control-hover); }
.section-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.chevron { --icon-size: 12px; transition: transform var(--panel-duration) var(--panel-easing); }
.chevron.expanded { transform: rotate(90deg); }
.workspace-list { list-style: none; margin: 0; padding: 0; }
.create-row { padding: 4px 0; }
.create-input {
  width: 100%;
  height: 36px;
  border: 1px solid var(--accent);
  border-radius: var(--control-radius);
  padding: 0 8px;
  font: 14px/1.5 var(--sans);
  background: var(--panel);
  color: var(--ink);
}
.empty { margin: 12px 8px; color: var(--muted); font-size: 13px; }
</style>
