<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useWorkspaceActions } from '../composables/useWorkspaceActions'
import KnowledgeCanvas from '../components/canvas/KnowledgeCanvas.vue'
import NoteView from '../components/notes/NoteView.vue'
import ExploreView from '../components/workspace/ExploreView.vue'
import WorkspaceLayout from '../components/workspace/WorkspaceLayout.vue'
import { ensureProductDemo } from '../workspace/seedDemo'

const { store, ui } = useWorkspaceActions()
const ready = ref(false)

onMounted(async () => {
  await store.loadWorkspaces()
  try {
    const noteId = await ensureProductDemo(store)
    if (noteId) ui.touchRecent(noteId)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[nexora:demo]', error)
    }
    ui.showToast('Could not load the demo workspace.\nYou can still create a note to begin.')
    if (store.workspaces.value[0]) {
      await store.selectWorkspace(store.workspaces.value[0].id)
    }
  }
  ready.value = true
})
</script>

<template>
  <WorkspaceLayout>
    <div v-if="!ready" class="booting">Opening your knowledge space…</div>
    <NoteView v-else-if="ui.mode.value === 'note'" />
    <KnowledgeCanvas v-else-if="ui.mode.value === 'canvas'" :key="store.workspace.value?.id" />
    <ExploreView v-else />
  </WorkspaceLayout>
</template>

<style scoped>
.booting {
  min-height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
}
</style>
