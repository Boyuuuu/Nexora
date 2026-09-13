<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { EDGE_TYPE_LABELS, NODE_TYPE_LABELS } from '../../workspace/labels'

const { store, ui, openNote, deleteNode, deleteEdge, updateNode } = useWorkspaceActions()

const node = computed(() => store.graph.value.nodes.find((item) => item.id === ui.selectedNodeId.value) ?? null)
const edge = computed(() => store.graph.value.edges.find((item) => item.id === ui.selectedEdgeId.value) ?? null)

const relatedNote = computed(() => {
  const noteId = node.value?.noteId
  return noteId ? (store.notes.value.find((item) => item.id === noteId) ?? null) : null
})

const connections = computed(() => {
  if (!node.value) return []
  return store.graph.value.edges
    .filter((item) => item.source === node.value?.id || item.target === node.value?.id)
    .map((item) => {
      const otherId = item.source === node.value?.id ? item.target : item.source
      const other = store.graph.value.nodes.find((candidate) => candidate.id === otherId)
      return { edge: item, label: other?.label ?? otherId, direction: item.source === node.value?.id ? 'out' : 'in' }
    })
})

const edgeEnds = computed(() => {
  if (!edge.value) return null
  const source = store.graph.value.nodes.find((item) => item.id === edge.value?.source)
  const target = store.graph.value.nodes.find((item) => item.id === edge.value?.target)
  return { source, target }
})

async function onLinkNote(event: Event): Promise<void> {
  if (!node.value) return
  const value = (event.target as HTMLSelectElement).value
  await updateNode(node.value.id, { note_id: value === '' ? null : value })
}

function close(): void {
  ui.selectNode(null)
  ui.selectEdge(null)
}
</script>

<template>
  <aside v-if="node || edge" class="inspector nexora-scroll">
    <header>
      <p class="kicker">{{ node ? 'Knowledge Node' : 'Relationship' }}</p>
      <button type="button" class="ghost" @click="close">Close</button>
    </header>

    <template v-if="node">
      <h2>{{ node.label }}</h2>
      <p class="type">{{ NODE_TYPE_LABELS[node.type] }}</p>

      <section>
        <p class="kicker">Related Note</p>
        <select :value="node.noteId ?? ''" @change="onLinkNote">
          <option value="">None</option>
          <option v-for="item in store.notes.value" :key="item.id" :value="item.id">{{ item.title }}</option>
        </select>
        <button v-if="relatedNote" type="button" class="primary open" @click="openNote(relatedNote.id)">
          Open Note →
        </button>
      </section>

      <section>
        <p class="kicker">Connections</p>
        <ul v-if="connections.length">
          <li v-for="item in connections" :key="item.edge.id">
            {{ item.direction === 'out' ? '→' : '←' }} {{ item.label }}
            <small>{{ EDGE_TYPE_LABELS[item.edge.type] }}</small>
          </li>
        </ul>
        <p v-else class="muted">No connections yet.</p>
      </section>

      <button type="button" class="danger" @click="deleteNode(node.id)">Delete</button>
    </template>

    <template v-else-if="edge && edgeEnds">
      <h2>{{ EDGE_TYPE_LABELS[edge.type] }}</h2>
      <p class="ends">
        {{ edgeEnds.source?.label ?? '—' }}
        <span>↓</span>
        {{ edgeEnds.target?.label ?? '—' }}
      </p>
      <button type="button" class="danger" @click="deleteEdge(edge.id)">Delete relationship</button>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: auto;
  padding: 1rem 0.95rem;
  background: var(--panel);
  border-left: 1px solid var(--line);
}

header {
  display: flex;
  justify-content: space-between;
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

h2 {
  margin: 0.7rem 0 0;
  font-family: var(--display);
}

.type,
.muted,
.ends {
  color: var(--muted);
}

.type {
  margin: 0.2rem 0 0;
  text-transform: capitalize;
}

section {
  margin-top: 1rem;
}

select {
  width: 100%;
  margin-top: 0.4rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
  font: inherit;
}

.open {
  width: 100%;
  margin-top: 0.5rem;
}

ul {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
}

li {
  padding: 0.35rem 0;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

small {
  color: var(--muted);
}

.ends {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0.6rem 0 0;
  font-size: 1.05rem;
  color: var(--ink);
}

.danger {
  margin-top: 1.1rem;
  background: transparent;
  color: #9f1239;
}
</style>
