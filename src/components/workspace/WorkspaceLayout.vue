<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useWorkspaceUi } from '../../composables/useWorkspaceUi'
import AIExplorer from '../ai/AIExplorer.vue'
import NodeInspector from '../canvas/NodeInspector.vue'
import WorkspaceConfirm from './WorkspaceConfirm.vue'
import WorkspaceHeader from './WorkspaceHeader.vue'
import WorkspaceSidebar from './WorkspaceSidebar.vue'
import WorkspaceToast from './WorkspaceToast.vue'

const ui = useWorkspaceUi()

const rightOpen = computed(() => ui.isAiPanelOpen.value || ui.inspectOpen.value)
const showInspector = computed(() => ui.inspectOpen.value)

function onResize(): void {
  if (window.innerWidth <= 760) {
    ui.setSidebarOpen(false)
    ui.setAiPanelOpen(false)
  } else if (window.innerWidth <= 1100) {
    ui.setAiPanelOpen(false)
  }
}

onMounted(() => {
  if (window.innerWidth <= 1100) onResize()
})

function closeDrawers(): void {
  if (window.innerWidth <= 760) ui.setSidebarOpen(false)
  if (window.innerWidth <= 1100) {
    ui.setAiPanelOpen(false)
    if (ui.inspectOpen.value) {
      ui.selectNode(null)
      ui.selectEdge(null)
    }
  }
}
</script>

<template>
  <div
    class="workspace"
    :class="{
      'sidebar-open': ui.isSidebarOpen.value,
      'right-open': rightOpen,
    }"
  >
    <WorkspaceHeader class="header" />
    <WorkspaceSidebar class="sidebar" />
    <main class="main">
      <slot />
    </main>
    <div class="right">
      <NodeInspector v-if="showInspector" />
      <AIExplorer v-else />
    </div>
    <button
      v-if="ui.isSidebarOpen.value || rightOpen"
      type="button"
      class="backdrop"
      aria-label="Close panels"
      @click="closeDrawers"
    />
    <WorkspaceToast />
    <WorkspaceConfirm />
  </div>
</template>

<style scoped>
.workspace {
  --sidebar-w: 0px;
  --right-w: 0px;
  height: 100%;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--right-w);
  grid-template-rows: 52px minmax(0, 1fr);
  grid-template-areas:
    'header header header'
    'sidebar main right';
  background: #f4f1ea;
  overflow: hidden;
  position: relative;
}

.workspace.sidebar-open {
  --sidebar-w: 260px;
}

.workspace.right-open {
  --right-w: 340px;
}

.header {
  grid-area: header;
}

.sidebar {
  grid-area: sidebar;
  min-width: 0;
}

.main {
  grid-area: main;
  min-width: 0;
  overflow: auto;
}

.right {
  grid-area: right;
  min-width: 0;
  overflow: hidden;
}

.backdrop {
  display: none;
}

@media (max-width: 1100px) {
  .workspace.right-open {
    --right-w: 0px;
  }

  .right {
    position: absolute;
    top: 52px;
    right: 0;
    bottom: 0;
    width: min(360px, 92vw);
    z-index: 30;
    transform: translateX(100%);
    transition: transform 180ms ease;
    box-shadow: -12px 0 30px rgba(28, 25, 23, 0.08);
  }

  .workspace.right-open .right {
    transform: translateX(0);
  }

  .backdrop {
    display: block;
    position: absolute;
    inset: 52px 0 0;
    background: rgba(28, 25, 23, 0.18);
    z-index: 25;
    border: 0;
    padding: 0;
  }

  .workspace:not(.right-open):not(.sidebar-open) .backdrop {
    display: none;
  }
}

@media (max-width: 760px) {
  .workspace.sidebar-open {
    --sidebar-w: 0px;
  }

  .sidebar {
    position: absolute;
    top: 52px;
    left: 0;
    bottom: 0;
    width: min(280px, 88vw);
    z-index: 30;
    transform: translateX(-100%);
    transition: transform 180ms ease;
    box-shadow: 12px 0 30px rgba(28, 25, 23, 0.08);
  }

  .workspace.sidebar-open .sidebar {
    transform: translateX(0);
  }
}

@media (min-width: 761px) and (max-width: 1100px) {
  .workspace:not(.right-open) .backdrop {
    display: none !important;
  }
}

@media (min-width: 1101px) {
  .backdrop {
    display: none !important;
  }
}
</style>
