<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { EXPLORE_SUGGESTIONS } from '../../composables/useWorkspaceUi'
import { blockTitle } from '../../workspace/labels'

const { store, ui, sendAiPlaceholder } = useWorkspaceActions()

const context = computed(() => {
  if (ui.mode.value === 'canvas') {
    const node = store.graph.value.nodes.find((item) => item.id === ui.selectedNodeId.value)
    return {
      kicker: 'Canvas',
      title: node ? `Selected Node: ${node.label}` : 'Knowledge Canvas',
      detail: node ? node.type : 'No node selected',
    }
  }

  const note = store.note.value
  const block = store.blocks.value.find((item) => item.id === ui.selectedBlockId.value)
  return {
    kicker: 'Note',
    title: note?.title ?? 'No note open',
    detail: block ? blockTitle(block) : 'No block selected',
  }
})

function send(text = ui.aiDraft.value): void {
  sendAiPlaceholder(text)
}

function useSuggestion(text: string): void {
  ui.aiDraft.value = text
  send(text)
}
</script>

<template>
  <aside class="ai">
    <header>
      <p class="kicker">AI Explorer</p>
      <h2>Explore your knowledge</h2>
    </header>

    <section class="context">
      <p class="kicker">Context</p>
      <strong>{{ context.kicker }}</strong>
      <p>{{ context.title }}</p>
      <small>{{ context.detail }}</small>
    </section>

    <div class="thread">
      <p v-if="!ui.aiMessages.value.length" class="placeholder">
        Ask anything about the current note, block, or node. The model is not connected yet — this is the entrance.
      </p>
      <article v-for="message in ui.aiMessages.value" :key="message.id" :class="['bubble', message.role]">
        <p>{{ message.content }}</p>
      </article>
    </div>

    <section class="suggested">
      <p class="kicker">Suggested</p>
      <button v-for="item in EXPLORE_SUGGESTIONS" :key="item.label" type="button" @click="useSuggestion(item.text)">
        {{ item.label }}
      </button>
    </section>

    <form class="composer" @submit.prevent="send()">
      <label>
        <span class="sr">Ask anything</span>
        <textarea v-model="ui.aiDraft.value" rows="2" placeholder="Ask anything..." @keydown.enter.exact.prevent="send()" />
      </label>
      <button type="submit" class="primary">Send</button>
    </form>
  </aside>
</template>

<style scoped>
.ai {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 0.95rem 1.1rem;
  background: var(--panel);
  border-left: 1px solid var(--line);
}

header h2 {
  margin: 0.15rem 0 0;
  font-family: var(--display);
  font-size: 1.25rem;
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

.context,
.suggested {
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.context strong,
.context p,
.context small {
  display: block;
}

.context strong {
  margin-top: 0.35rem;
  font-size: 0.78rem;
  color: var(--accent);
}

.context p {
  margin: 0.1rem 0 0;
}

.context small {
  color: var(--muted);
  margin-top: 0.15rem;
}

.thread {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.placeholder {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.bubble {
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  background: #fff;
  border: 1px solid var(--line);
}

.bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.bubble.user {
  background: rgba(15, 118, 110, 0.08);
  border-color: transparent;
}

.suggested {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.suggested button {
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.28rem 0;
  color: var(--ink);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.composer textarea {
  width: 100%;
  resize: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  font: inherit;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
