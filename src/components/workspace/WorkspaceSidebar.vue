<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import GraphMiniMap from './GraphMiniMap.vue'

const {
  store,
  ui,
  openNote,
  createNote,
  selectWorkspace,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
} = useWorkspaceActions()

type SectionKey = 'workspace' | 'notes'

const SECTIONS_KEY = 'nexora.sidebar.sections'

const openSections = reactive<Record<SectionKey, boolean>>({
  workspace: true,
  notes: true,
})

function readSections(): void {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>
    for (const key of ['workspace', 'notes'] as const) {
      if (typeof parsed[key] === 'boolean') openSections[key] = parsed[key]
    }
  } catch {
    /* ignore */
  }
}

function persistSections(): void {
  localStorage.setItem(SECTIONS_KEY, JSON.stringify({ ...openSections }))
}

readSections()

function toggleSection(key: SectionKey): void {
  openSections[key] = !openSections[key]
  persistSections()
}

const menuId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const creating = ref(false)
const createDraft = ref('Untitled Workspace')
const menuRoot = ref<HTMLElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
const createInput = ref<HTMLInputElement | null>(null)

function setRenameInput(el: unknown): void {
  renameInput.value = el instanceof HTMLInputElement ? el : null
}

const filteredNotes = computed(() => {
  const query = ui.searchQuery.value.trim().toLowerCase()
  if (!query) return store.notes.value
  return store.notes.value.filter((note) => note.title.toLowerCase().includes(query))
})

function closeMenus(): void {
  menuId.value = null
}

function onDoc(event: MouseEvent): void {
  if (!menuRoot.value?.contains(event.target as Node)) closeMenus()
}

onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

async function onSwitch(id: string): Promise<void> {
  if (renamingId.value) return
  closeMenus()
  if (store.workspace.value?.id === id) return
  await selectWorkspace(id)
}

function openMenu(id: string, event: MouseEvent): void {
  event.stopPropagation()
  menuId.value = menuId.value === id ? null : id
}

async function startRename(id: string): Promise<void> {
  const workspace = store.workspaces.value.find((item) => item.id === id)
  if (!workspace) return
  closeMenus()
  renamingId.value = id
  renameDraft.value = workspace.metadata.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

async function commitRename(): Promise<void> {
  const id = renamingId.value
  if (!id) return
  const workspace = store.workspaces.value.find((item) => item.id === id)
  const next = renameDraft.value.trim()
  renamingId.value = null
  if (!workspace || !next || next === workspace.metadata.name) {
    renameDraft.value = workspace?.metadata.name ?? ''
    return
  }
  await renameWorkspace(id, next)
}

function cancelRename(): void {
  renamingId.value = null
}

async function startCreate(): Promise<void> {
  closeMenus()
  if (!openSections.workspace) {
    openSections.workspace = true
    persistSections()
  }
  creating.value = true
  createDraft.value = 'Untitled Workspace'
  await nextTick()
  createInput.value?.focus()
  createInput.value?.select()
}

async function commitCreate(): Promise<void> {
  if (!creating.value) return
  const name = createDraft.value.trim() || 'Untitled Workspace'
  creating.value = false
  await createWorkspace(name)
}

function cancelCreate(): void {
  creating.value = false
}

async function onDelete(id: string): Promise<void> {
  closeMenus()
  await deleteWorkspace(id)
}

async function onCreateNote(): Promise<void> {
  if (!openSections.notes) {
    openSections.notes = true
    persistSections()
  }
  await createNote()
}
</script>

<template>
  <aside ref="menuRoot" class="sidebar nexora-scroll">
    <div class="brand">
      <span class="mark">N</span>
      <div>
        <strong>Nexora</strong>
        <small>知域</small>
      </div>
    </div>

    <section class="fold" :class="{ open: openSections.workspace }">
      <div class="section-head">
        <button
          type="button"
          class="fold-toggle"
          :aria-expanded="openSections.workspace"
          @click="toggleSection('workspace')"
        >
          <span class="chevron" aria-hidden="true">▾</span>
          <span class="kicker">Workspace</span>
        </button>
        <button type="button" class="icon-btn" title="New workspace" @click.stop="startCreate">＋</button>
      </div>

      <div v-show="openSections.workspace" class="fold-body">
        <ul v-if="store.workspaces.value.length" class="workspace-list">
          <li v-for="item in store.workspaces.value" :key="item.id" class="workspace-row">
            <template v-if="renamingId === item.id">
              <input
                :ref="setRenameInput"
                v-model="renameDraft"
                class="rename-input"
                type="text"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.escape.prevent="cancelRename"
                @blur="commitRename"
              />
            </template>
            <template v-else>
              <button
                type="button"
                class="workspace-btn"
                :class="{ active: store.workspace.value?.id === item.id }"
                @click="onSwitch(item.id)"
              >
                <span class="dot" aria-hidden="true" />
                <span class="name">{{ item.metadata.name }}</span>
              </button>
              <div class="row-actions">
                <button
                  type="button"
                  class="icon-btn more"
                  :aria-expanded="menuId === item.id"
                  title="Workspace actions"
                  @click="openMenu(item.id, $event)"
                >
                  ⋯
                </button>
                <div v-if="menuId === item.id" class="menu">
                  <button type="button" @click="startRename(item.id)">Rename</button>
                  <button type="button" class="danger" @click="onDelete(item.id)">Delete</button>
                </div>
              </div>
            </template>
          </li>
        </ul>
        <p v-else class="empty">No workspace yet.</p>

        <div v-if="creating" class="create-row">
          <input
            ref="createInput"
            v-model="createDraft"
            class="rename-input"
            type="text"
            placeholder="Workspace name"
            @keydown.enter.prevent="commitCreate"
            @keydown.escape.prevent="cancelCreate"
            @blur="commitCreate"
          />
        </div>
        <button v-else type="button" class="ghost add" @click="startCreate">＋ New Workspace</button>
      </div>
    </section>

    <section class="fold" :class="{ open: openSections.notes }">
      <div class="section-head">
        <button
          type="button"
          class="fold-toggle"
          :aria-expanded="openSections.notes"
          @click="toggleSection('notes')"
        >
          <span class="chevron" aria-hidden="true">▾</span>
          <span class="kicker">Notes</span>
          <span class="count">{{ filteredNotes.length }}</span>
        </button>
        <button type="button" class="icon-btn" title="New note" @click.stop="onCreateNote">＋</button>
      </div>

      <div v-show="openSections.notes" class="fold-body">
        <ul v-if="filteredNotes.length" class="list">
          <li v-for="note in filteredNotes" :key="note.id">
            <button
              type="button"
              :class="{ active: store.note.value?.id === note.id && ui.mode.value === 'note' }"
              @click="openNote(note.id)"
            >
              {{ note.title }}
            </button>
          </li>
        </ul>
        <p v-else class="empty">No notes yet.</p>
        <button type="button" class="ghost add" @click="onCreateNote">＋ New Note</button>
      </div>
    </section>

    <GraphMiniMap class="mini-wrap" />
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  overflow: auto;
  padding: 1rem 0.95rem 1.1rem;
  background: #fbf8f2;
  border-right: 1px solid var(--line);
}

.mini-wrap {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1.15rem;
}

.mark {
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

.brand strong,
.brand small {
  display: block;
  line-height: 1.15;
}

.brand strong {
  font-family: var(--display);
}

.brand small {
  color: var(--muted);
  font-size: 0.75rem;
}

.fold + .fold {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
}

.fold-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  padding: 0.2rem 0.25rem;
  border-radius: 6px;
  text-align: left;
  color: inherit;
}

.fold-toggle:hover {
  background: rgba(15, 118, 110, 0.06);
}

.chevron {
  display: inline-flex;
  width: 0.85rem;
  color: var(--muted);
  font-size: 0.7rem;
  transform: rotate(-90deg);
  transition: transform 140ms ease;
}

.fold.open .chevron {
  transform: rotate(0deg);
}

.count {
  color: #a8a29e;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.fold-body {
  margin-top: 0.2rem;
}

.workspace-list,
.list {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
}

.workspace-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-bottom: 0.15rem;
}

.workspace-btn,
.list button,
.add {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.38rem 0.45rem;
  border-radius: 8px;
  color: var(--ink);
}

.workspace-btn {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex: 1;
}

.workspace-btn .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: #d6d3d1;
  flex: none;
}

.workspace-btn.active .dot {
  background: var(--accent);
}

.workspace-btn:hover,
.list button:hover,
.add:hover,
.icon-btn:hover {
  background: rgba(15, 118, 110, 0.06);
}

.workspace-btn.active,
.list button.active {
  background: rgba(15, 118, 110, 0.1);
  color: var(--accent);
  font-weight: 600;
}

.row-actions {
  position: relative;
  flex: none;
}

.icon-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  padding: 0;
  font-size: 0.95rem;
  line-height: 1;
}

.more {
  opacity: 0;
}

.workspace-row:hover .more,
.more:focus-visible,
.more[aria-expanded='true'] {
  opacity: 1;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 12;
  min-width: 120px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.3rem;
  box-shadow: 0 10px 28px rgba(28, 25, 23, 0.08);
}

.menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.4rem 0.55rem;
  border-radius: 7px;
}

.menu button:hover {
  background: rgba(15, 118, 110, 0.06);
}

.menu .danger {
  color: #9f1239;
}

.rename-input {
  width: 100%;
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font: inherit;
  background: #fff;
  outline: none;
}

.create-row {
  margin-top: 0.35rem;
}

.add {
  margin-top: 0.35rem;
  color: var(--accent);
  font-weight: 600;
}

.empty {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
}
</style>
