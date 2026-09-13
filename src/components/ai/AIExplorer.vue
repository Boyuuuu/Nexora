<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { EXPLORE_SUGGESTIONS } from '../../composables/useWorkspaceUi'
import { blockTitle } from '../../workspace/labels'
import AppIcon from '../ui/AppIcon.vue'

const { store, ui, sendAiPlaceholder } = useWorkspaceActions()

const context = computed(() => {
  const workspace = store.workspace.value
  const node = ui.mode.value === 'canvas'
    ? store.graph.value.nodes.find((item) => item.id === ui.selectedNodeId.value)
    : undefined
  const candidate = ui.mode.value === 'canvas'
    ? store.notes.value.find((item) => item.id === node?.noteId)
    : store.note.value
  const note = candidate?.workspaceId === workspace?.id ? candidate : undefined
  const block = ui.mode.value === 'note'
    ? note?.blocks.find((item) => item.id === ui.selectedBlockId.value)
    : undefined
  return [
    { kind: 'Workspace', name: workspace?.metadata.name, empty: '未选择' },
    { kind: 'Note', name: note?.title, empty: '未选择' },
    { kind: 'Block', name: block ? blockTitle(block) : undefined, empty: '未选中' },
  ]
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
  <aside class="ai nexora-scroll" aria-label="AI 聊天">
    <ol class="context-path" aria-label="聊天上下文">
      <li v-for="(part, index) in context" :key="part.kind" :class="{ empty: !part.name }" :title="`${part.kind}: ${part.name ?? part.empty}`">
        <span class="context-kind">{{ part.kind }}</span>
        <span class="context-name">{{ part.name ?? part.empty }}</span>
        <AppIcon v-if="index < context.length - 1" name="chevron" class="context-separator" />
      </li>
    </ol>

    <div class="thread nexora-scroll">
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
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 0.95rem 1.1rem;
  background: var(--panel);
  border-left: 1px solid var(--line);
}

.context-path { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; flex: none; list-style: none; padding: 0 0 12px; margin: 0; border-bottom: 1px solid var(--line); }
.context-path li { position: relative; min-width: 0; }
.context-kind { display: block; color: var(--muted); font-size: 11px; line-height: 1.4; }
.context-name { display: block; margin-top: 4px; color: var(--ink); font-size: 13px; font-weight: 500; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty .context-name { color: var(--muted); font-weight: 400; }
.context-separator { --icon-size: 10px; position: absolute; right: -14px; top: 24px; color: var(--muted); }

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

.suggested {
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.thread {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
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
