<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GraphNode } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'

const { store, renameNote, deleteNote, openCanvas } = useWorkspaceActions()

const draft = ref(store.note.value?.title ?? '')
watch(
  () => store.note.value?.title,
  (title) => {
    draft.value = title ?? ''
  },
)

const related = computed(() => {
  const noteId = store.note.value?.id
  if (!noteId) return []
  return store.graph.value.nodes.filter((node) => node.noteId === noteId)
})

const moreRelated = computed(() => {
  const noteTitle = store.note.value?.title.toLowerCase() ?? ''
  const already = new Set(related.value.map((node) => node.id))
  return store.graph.value.nodes.filter(
    (node) => !already.has(node.id) && node.label.toLowerCase().includes(noteTitle) && noteTitle.length > 0,
  )
})

const chips = computed(() => {
  const seen = new Set<string>()
  const list: GraphNode[] = []
  for (const node of [...related.value, ...moreRelated.value]) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    list.push(node)
  }
  return list
})

async function commitTitle(): Promise<void> {
  const note = store.note.value
  if (!note) return
  if (draft.value.trim() && draft.value.trim() !== note.title) {
    await renameNote(note.id, draft.value)
  } else {
    draft.value = note.title
  }
}

function openRelated(nodeId?: string): void {
  const target = nodeId ?? chips.value[0]?.id
  void openCanvas(target)
}
</script>

<template>
  <header v-if="store.note.value" class="note-head">
    <div class="title-row">
      <input v-model="draft" class="title" @blur="commitTitle" @keydown.enter.prevent="commitTitle" />
      <button type="button" class="ghost" @click="deleteNote(store.note.value.id)">Delete</button>
    </div>
    <p class="meta">{{ store.note.value.blocks.length }} blocks · Knowledge document</p>

    <section class="related">
      <div class="related-top">
        <p class="kicker">Related Knowledge</p>
        <button v-if="chips.length" type="button" class="ghost" @click="openRelated()">Open in Canvas →</button>
      </div>
      <div v-if="chips.length" class="chips">
        <button v-for="node in chips" :key="node.id" type="button" @click="openRelated(node.id)">
          {{ node.label }}
        </button>
      </div>
      <p v-else class="hint">No linked nodes yet. Convert a block, or connect this note from the canvas.</p>
    </section>
  </header>
</template>

<style scoped>
.note-head {
  margin-bottom: 1.15rem;
}

.title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.title {
  flex: 1;
  border: 0;
  background: transparent;
  font-family: var(--display);
  font-size: clamp(1.7rem, 4vw, 2.3rem);
  line-height: 1.15;
  padding: 0;
  color: inherit;
}

.meta,
.hint {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.related {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.related-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.55rem;
}

.chips button {
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}
</style>
