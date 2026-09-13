<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkspaceUi } from '../../composables/useWorkspaceUi'
import AIExplorer from '../ai/AIExplorer.vue'
import NodeInspector from '../canvas/NodeInspector.vue'
import IconButton from '../ui/IconButton.vue'
import WorkspaceConfirm from './WorkspaceConfirm.vue'
import WorkspaceHeader from './WorkspaceHeader.vue'
import WorkspaceNoteSearch from './WorkspaceNoteSearch.vue'
import WorkspaceSidebar from './WorkspaceSidebar.vue'
import WorkspaceToast from './WorkspaceToast.vue'

const ui = useWorkspaceUi()
const searchOpen = ref(false)
const main = ref<HTMLElement | null>(null)

const rightOpen = computed(() => ui.isAiPanelOpen.value || ui.inspectOpen.value)
const showInspector = computed(() => ui.inspectOpen.value)
let previousWidth = Infinity

function onResize(): void {
  const width = window.innerWidth
  if (width <= 760 && previousWidth > 760) ui.setSidebarOpen(false)
  if (width <= 1100 && previousWidth > 1100) ui.setAiPanelOpen(false)
  previousWidth = width
}

onMounted(() => {
  onResize()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => window.removeEventListener('resize', onResize))

async function onContentSelected(): Promise<void> {
  searchOpen.value = false
  if (window.innerWidth <= 760) ui.setSidebarOpen(false)
  await nextTick()
  main.value?.scrollTo({ top: 0, behavior: 'instant' })
  main.value?.focus({ preventScroll: true })
}

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
    <div
      id="workspace-sidebar"
      class="sidebar-shell"
      :inert="!ui.isSidebarOpen.value"
      :aria-hidden="!ui.isSidebarOpen.value"
    >
      <WorkspaceSidebar class="sidebar-content" @search="searchOpen = true" @navigate="onContentSelected" />
    </div>
    <IconButton
      class="sidebar-toggle"
      icon="sidebar"
      :label="ui.isSidebarOpen.value ? '收起侧边栏' : '展开侧边栏'"
      :tooltip-align="ui.isSidebarOpen.value ? 'end' : 'start'"
      :aria-expanded="ui.isSidebarOpen.value"
      aria-controls="workspace-sidebar"
      @click="ui.toggleSidebar()"
    />
    <main ref="main" class="main nexora-scroll" tabindex="-1">
      <slot />
    </main>
    <div class="right" :inert="!rightOpen" :aria-hidden="!rightOpen">
      <NodeInspector v-if="showInspector" />
      <AIExplorer v-else id="workspace-chat-panel" />
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
    <WorkspaceNoteSearch :open="searchOpen" @close="searchOpen = false" @selected="onContentSelected" />
  </div>
</template>

<style scoped>
.workspace {
  --sidebar-size: min(280px, 88vw);
  --workspace-gutter: 12px;
  --workspace-header-height: 52px;
  --sidebar-w: 0px;
  --right-w: 0px;
  height: 100%;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--right-w);
  grid-template-rows: var(--workspace-header-height) minmax(0, 1fr);
  grid-template-areas:
    'sidebar header header'
    'sidebar main right';
  background: var(--bg);
  overflow: hidden;
  position: relative;
  transition: grid-template-columns var(--panel-duration) var(--panel-easing);
}

.workspace.sidebar-open {
  --sidebar-w: var(--sidebar-size);
}

.workspace.right-open {
  --right-w: 340px;
}

.header {
  grid-area: header;
}

.workspace:not(.sidebar-open) .header {
  --header-leading-space: calc(var(--workspace-gutter) + var(--control-size) + 8px);
}

/* Clip the full-width sidebar, including its padding and border, at the grid boundary. */
.sidebar-shell {
  grid-area: sidebar;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  visibility: hidden;
  transition: visibility 0s linear var(--panel-duration);
}

.workspace.sidebar-open .sidebar-shell {
  visibility: visible;
  transition-delay: 0s;
}

.sidebar-content {
  width: var(--sidebar-size);
  transform: translateX(-100%);
  transition: transform var(--panel-duration) var(--panel-easing);
}

.workspace.sidebar-open .sidebar-content {
  transform: translateX(0);
}

/* One persistent control moves with the panel, keeping focus and its vertical position. */
.sidebar-toggle {
  position: absolute;
  top: 8px;
  left: var(--workspace-gutter);
  z-index: 40;
  transition:
    transform var(--panel-duration) var(--panel-easing),
    color 140ms ease,
    background-color 140ms ease;
}

.workspace.sidebar-open .sidebar-toggle {
  transform: translateX(calc(var(--sidebar-size) - 2 * var(--workspace-gutter) - var(--control-size)));
}

.main {
  grid-area: main;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
}

.main:focus {
  outline: none;
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
    grid-area: auto;
    top: var(--workspace-header-height);
    right: 0;
    bottom: 0;
    width: min(360px, 92vw);
    z-index: 30;
    transform: translateX(100%);
    transition: transform var(--panel-duration) var(--panel-easing);
    box-shadow: -12px 0 30px rgba(28, 25, 23, 0.08);
  }

  .workspace.right-open .right {
    transform: translateX(0);
  }

  .backdrop {
    display: block;
    position: absolute;
    inset: var(--workspace-header-height) 0 0;
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

  .header {
    --header-leading-space: calc(var(--workspace-gutter) + var(--control-size) + 8px);
  }

  .sidebar-shell {
    position: absolute;
    grid-area: auto;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-size);
    z-index: 30;
    transform: translateX(-100%);
    transition:
      transform var(--panel-duration) var(--panel-easing),
      visibility 0s linear var(--panel-duration),
      box-shadow var(--panel-duration) ease;
  }

  .sidebar-content {
    transform: none;
  }

  .workspace.sidebar-open .sidebar-shell {
    transform: translateX(0);
    box-shadow: 12px 0 30px rgba(28, 25, 23, 0.08);
  }

  .workspace.sidebar-open .backdrop {
    inset: 0;
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
