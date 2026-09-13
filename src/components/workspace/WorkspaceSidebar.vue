<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'

const { store, ui, openNote, openCanvas, createNote, selectWorkspace } = useWorkspaceActions()

const filteredNotes = computed(() => {
  const query = ui.searchQuery.value.trim().toLowerCase()
  if (!query) return store.notes.value
  return store.notes.value.filter((note) => note.title.toLowerCase().includes(query))
})

const recentNotes = computed(() => {
  return ui.recentNoteIds.value
    .map((id) => store.notes.value.find((note) => note.id === id))
    .filter((note): note is NonNullable<typeof note> => note !== undefined)
    .slice(0, 5)
})
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="mark">N</span>
      <div>
        <strong>Nexora</strong>
        <small>知域</small>
      </div>
    </div>

    <section>
      <p class="kicker">Workspace</p>
      <label class="workspace-select">
        <span class="sr">Workspace</span>
        <select
          :value="store.workspace.value?.id ?? ''"
          @change="selectWorkspace(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in store.workspaces.value" :key="item.id" :value="item.id">
            {{ item.metadata.name }}
          </option>
        </select>
      </label>
    </section>

    <section>
      <p class="kicker">Knowledge</p>
      <p class="group">Notes</p>
      <ul v-if="filteredNotes.length" class="list">
        <li v-for="note in filteredNotes" :key="note.id">
          <button
            type="button"
            :class="{ active: store.note.value?.id === note.id && ui.mode.value === 'note' }"
            @click="openNote(note.id)"
          >
            {{ note.title }}
          </button>
        </li>
      </ul>
      <p v-else class="empty">No notes yet.</p>
      <button type="button" class="ghost add" @click="createNote">＋ New Note</button>
    </section>

    <section>
      <p class="kicker">Graph</p>
      <button
        type="button"
        class="canvas-link"
        :class="{ active: ui.mode.value === 'canvas' }"
        @click="openCanvas()"
      >
        ◎ Knowledge Canvas
      </button>
    </section>

    <section v-if="recentNotes.length">
      <p class="kicker">Recent</p>
      <ul class="list">
        <li v-for="note in recentNotes" :key="note.id">
          <button type="button" @click="openNote(note.id)">{{ note.title }}</button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  overflow: auto;
  padding: 1rem 0.95rem 1.4rem;
  background: #fbf8f2;
  border-right: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1.15rem;
}

.mark {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--display);
  font-weight: 700;
}

.brand strong,
.brand small {
  display: block;
  line-height: 1.15;
}

.brand strong {
  font-family: var(--display);
}

.brand small {
  color: var(--muted);
  font-size: 0.75rem;
}

section + section {
  margin-top: 1.15rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.kicker,
.group {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

.group {
  margin: 0.55rem 0 0.35rem;
}

.workspace-select select {
  width: 100%;
  margin-top: 0.45rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
  font: inherit;
  background: #fff;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list button,
.canvas-link,
.add {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.38rem 0.45rem;
  border-radius: 8px;
  color: var(--ink);
}

.list button:hover,
.canvas-link:hover,
.add:hover {
  background: rgba(15, 118, 110, 0.06);
}

.list button.active,
.canvas-link.active {
  background: rgba(15, 118, 110, 0.1);
  color: var(--accent);
  font-weight: 600;
}

.add {
  margin-top: 0.35rem;
  color: var(--accent);
  font-weight: 600;
}

.empty {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
