<script setup lang="ts">
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import WorkspaceToolbar from './WorkspaceToolbar.vue'

const { store } = useWorkspaceActions()
</script>

<template>
  <header class="header">
    <strong class="workspace-name" :title="store.workspace.value?.metadata.name">
      {{ store.workspace.value?.metadata.name ?? 'Workspace' }}
    </strong>
    <WorkspaceToolbar />
  </header>
</template>

<style scoped>
.header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  height: var(--workspace-header-height);
  padding: 0 var(--workspace-gutter);
  padding-left: var(--header-leading-space, var(--workspace-gutter));
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  transition: padding-left var(--panel-duration) var(--panel-easing);
}
.workspace-name {
  min-width: 0;
  font-family: var(--display);
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 720px) { .header { gap: 8px; } }
</style>
