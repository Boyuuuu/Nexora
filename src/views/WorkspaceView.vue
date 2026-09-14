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
    <Transition v-else-if="ui.mode.value === 'canvas'" name="canvas-scope" mode="out-in">
      <KnowledgeCanvas :key="`${store.workspace.value?.id}:${ui.canvasScope.value.type}:${ui.canvasScope.value.type === 'note' ? ui.canvasScope.value.noteId : ''}`" :scope="ui.canvasScope.value" />
    </Transition>
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

.canvas-scope-enter-active,
.canvas-scope-leave-active { transition: opacity 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1); }
.canvas-scope-enter-from { opacity: 0; transform: scale(0.985) translateY(8px); }
.canvas-scope-leave-to { opacity: 0; transform: scale(1.015) translateY(-8px); }
@media (prefers-reduced-motion: reduce) {
  .canvas-scope-enter-active, .canvas-scope-leave-active { transition: none; }
}
</style>
