<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNav from './components/AppNav.vue'
import WorkspaceTestTools from './components/workspace/WorkspaceTestTools.vue'
import WorkspaceTransferDialog from './components/workspace/WorkspaceTransferDialog.vue'
import { useWorkspaceUi } from './composables/useWorkspaceUi'

const route = useRoute()
const router = useRouter()
const ui = useWorkspaceUi()
const isWorkspace = computed(() => route.meta.workspace === true)

// Existing /backup bookmarks open the export dialog over the workspace.
watch(() => route.query.export, (value) => {
  if (value !== '1') return
  ui.openTransfer('export')
  const { export: _export, ...query } = route.query
  void router.replace({ path: route.path, query, hash: route.hash })
}, { immediate: true })
</script>

<template>
  <div class="app-shell" :class="{ 'is-workspace': isWorkspace }">
    <AppNav v-if="!isWorkspace" />
    <main class="app-main" :class="{ 'is-workspace': isWorkspace }">
      <RouterView />
    </main>
    <footer v-if="!isWorkspace" class="app-footer"><WorkspaceTestTools /></footer>
    <WorkspaceTransferDialog :kind="ui.transferDialog.value" @close="ui.closeTransfer()" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell.is-workspace,
.app-main.is-workspace {
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
}

.app-main {
  min-height: calc(100vh - 52px);
}
.app-footer { padding: 8px 16px 16px; }

.app-main.is-workspace {
  min-height: 100vh;
}
</style>
