<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import type { WorkspaceMode } from '../../composables/useWorkspaceUi'

const { store, ui } = useWorkspaceActions()
const route = useRoute()

const modes: { id: WorkspaceMode; label: string }[] = [
  { id: 'note', label: 'Note' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'explore', label: 'Explore' },
]

const labs = [
  { to: '/test-lab', label: '数据层' },
  { to: '/operation-lab', label: '操作层' },
  { to: '/backup', label: '备份' },
]

function setMode(id: WorkspaceMode): void {
  ui.setMode(id)
}
</script>

<template>
  <header class="header">
    <div class="left">
      <button type="button" class="icon" :aria-pressed="ui.isSidebarOpen.value" @click="ui.toggleSidebar()">
        Sidebar
      </button>
      <RouterLink class="brand" to="/" aria-label="Nexora 知域">
        <span class="brand-mark">N</span>
      </RouterLink>
      <div class="identity">
        <strong>{{ store.workspace.value?.metadata.name ?? 'Workspace' }}</strong>
        <span>Knowledge Workspace</span>
      </div>
    </div>

    <nav class="modes" aria-label="Workspace mode">
      <button
        v-for="item in modes"
        :key="item.id"
        type="button"
        :class="{ active: ui.mode.value === item.id }"
        @click="setMode(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <div class="right">
      <input
        v-model="ui.searchQuery.value"
        class="search"
        type="search"
        placeholder="Search notes"
        aria-label="Search notes"
      />
      <button type="button" class="icon" :aria-pressed="ui.isAiPanelOpen.value" @click="ui.toggleAiPanel()">
        AI
      </button>
      <nav class="labs" aria-label="测试与工具">
        <RouterLink
          v-for="link in labs"
          :key="link.to"
          :to="link.to"
          class="lab-link"
          :class="{ 'is-active': route.path.startsWith(link.to) }"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.75rem;
  height: 52px;
  padding: 0 0.85rem;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.right {
  justify-content: flex-end;
}

.brand {
  display: grid;
  text-decoration: none;
  color: inherit;
}

.brand-mark {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--display);
  font-weight: 700;
  font-size: 0.85rem;
}

.identity {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
}

.identity strong {
  font-family: var(--display);
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity span {
  color: var(--muted);
  font-size: 0.72rem;
}

.modes {
  display: flex;
  gap: 0.2rem;
  padding: 0.18rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
}

.modes button {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 0.28rem 0.8rem;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.85rem;
}

.modes button.active {
  background: rgba(15, 118, 110, 0.1);
  color: var(--accent);
}

.icon {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 0.32rem 0.55rem;
}

.search {
  width: 150px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.32rem 0.7rem;
  font: inherit;
  background: #fff;
}

.labs {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  padding-left: 0.55rem;
  border-left: 1px solid var(--line);
}

.lab-link {
  text-decoration: none;
  color: var(--muted);
  padding: 0.28rem 0.5rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.lab-link:hover {
  color: var(--ink);
  background: rgba(15, 118, 110, 0.06);
}

.lab-link.is-active {
  color: var(--accent);
  background: rgba(15, 118, 110, 0.1);
}

@media (max-width: 1100px) {
  .search {
    width: 120px;
  }

  .lab-link {
    padding: 0.28rem 0.4rem;
  }
}

@media (max-width: 860px) {
  .header {
    grid-template-columns: 1fr auto;
  }

  .search,
  .identity span {
    display: none;
  }
}

@media (max-width: 720px) {
  .header {
    height: auto;
    min-height: 52px;
    padding: 0.45rem 0.7rem;
    row-gap: 0.4rem;
  }

  .labs {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
