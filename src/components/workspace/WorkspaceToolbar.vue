<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceUi } from '../../composables/useWorkspaceUi'
import IconButton from '../ui/IconButton.vue'

const ui = useWorkspaceUi()
const route = useRoute()
const router = useRouter()
const inWorkspace = computed(() => route.meta.workspace === true)
const chatOpen = computed(() => inWorkspace.value && ui.isAiPanelOpen.value && !ui.inspectOpen.value)

async function toggleChat(): Promise<void> {
  if (inWorkspace.value) ui.toggleAiPanel()
  else {
    await router.push('/')
    ui.openAiPanel()
  }
}
</script>

<template>
  <nav class="workspace-toolbar" aria-label="工作区工具">
    <IconButton
      class="toolbar-button"
      :class="{ active: chatOpen }"
      icon="chat"
      text="chat"
      :label="chatOpen ? '收起聊天' : '打开聊天'"
      :aria-expanded="chatOpen"
      :aria-controls="inWorkspace ? 'workspace-chat-panel' : undefined"
      @click="toggleChat"
    />
    <IconButton
      class="toolbar-button"
      :class="{ active: ui.transferDialog.value === 'export' }"
      icon="download"
      text="备份导出"
      label="备份导出"
      tooltip-align="end"
      aria-haspopup="dialog"
      :aria-expanded="ui.transferDialog.value === 'export'"
      aria-controls="workspace-transfer-dialog"
      @click="ui.openTransfer('export')"
    />
  </nav>
</template>

<style scoped>
.workspace-toolbar { display: flex; align-items: center; gap: 8px; flex: none; }
.toolbar-button { border: 1px solid var(--line); color: var(--ink); white-space: nowrap; }
.toolbar-button.active { background: rgba(15, 118, 110, 0.1); border-color: transparent; color: var(--accent); }
@media (max-width: 720px) { .workspace-toolbar { gap: 4px; } }
</style>
