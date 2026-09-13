<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { EXPLORE_SUGGESTIONS } from '../../composables/useWorkspaceUi'
import { blockTitle } from '../../workspace/labels'

const { store, ui, openNote, openCanvas, sendAiPlaceholder } = useWorkspaceActions()

const contextLine = computed(() => {
  if (store.note.value) {
    const block = store.blocks.value.find((item) => item.id === ui.selectedBlockId.value)
    return block ? `${store.note.value.title} · ${blockTitle(block)}` : store.note.value.title
  }
  return 'Choose a note or a node to begin.'
})
</script>

<template>
  <section class="explore">
    <p class="kicker">Explore</p>
    <h1>Knowledge can have structure.<br />Learning should not have a fixed path.</h1>
    <p class="lead">You are not reading an article. You are assembling a space of ideas — notes, blocks, nodes, and the links between them.</p>

    <section class="context">
      <p class="kicker">Current context</p>
      <strong>{{ contextLine }}</strong>
    </section>

    <div class="grid">
      <article>
        <p class="kicker">Notes</p>
        <ul>
          <li v-for="note in store.notes.value.slice(0, 5)" :key="note.id">
            <button type="button" @click="openNote(note.id)">{{ note.title }}</button>
          </li>
        </ul>
      </article>
      <article>
        <p class="kicker">Graph</p>
        <ul>
          <li v-for="node in store.graph.value.nodes.slice(0, 5)" :key="node.id">
            <button type="button" @click="openCanvas(node.id)">{{ node.label }}</button>
          </li>
        </ul>
        <button type="button" class="ghost" @click="openCanvas()">Open Knowledge Canvas →</button>
      </article>
    </div>

    <section class="prompts">
      <p class="kicker">Suggested</p>
      <button v-for="item in EXPLORE_SUGGESTIONS" :key="item.label" type="button" @click="sendAiPlaceholder(item.text)">
        {{ item.label }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.explore {
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.4rem 3rem;
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
}

h1 {
  margin: 0.4rem 0 0;
  font-family: var(--display);
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  line-height: 1.2;
}

.lead,
.context strong {
  color: var(--muted);
}

.lead {
  max-width: 38rem;
}

.context,
.grid article,
.prompts {
  margin-top: 1.2rem;
  padding: 1rem 1.05rem;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.context strong {
  display: block;
  margin-top: 0.35rem;
  color: var(--ink);
  font-size: 1.05rem;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

ul {
  list-style: none;
  margin: 0.45rem 0 0;
  padding: 0;
}

li button,
.prompts button {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.35rem 0;
}

.prompts button:hover,
li button:hover {
  color: var(--accent);
}

@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
