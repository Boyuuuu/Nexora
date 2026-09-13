<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue'
import WorkspaceToolbar from './workspace/WorkspaceToolbar.vue'
</script>

<template>
  <header class="app-nav">
    <RouterLink class="back-link" to="/">
      <AppIcon name="chevron" />
      <span>工作区</span>
    </RouterLink>
    <WorkspaceToolbar />
  </header>
</template>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  position: sticky;
  top: 0;
  z-index: 40;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: var(--control-size);
  padding: 0 8px;
  color: var(--ink);
  border-radius: var(--control-radius);
  text-decoration: none;
  white-space: nowrap;
  font: 500 14px/1 var(--sans);
}
.back-link .app-icon { --icon-size: 16px; transform: rotate(180deg); }
.back-link:hover { background: var(--control-hover); }
.back-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
