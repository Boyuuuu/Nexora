<script setup lang="ts">
import { useAiSession } from '../../ai/session'
import { BLOCK_TYPE_LABELS } from '../../workspace/labels'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import AppIcon from '../ui/AppIcon.vue'

const session = useAiSession()
const store = useKnowledgeStore()
</script>

<template>
  <div v-if="session.quotes.value.length" class="chips" aria-label="已引用内容">
    <button
      v-for="quote in session.quotes.value"
      :key="quote.id"
      type="button"
      class="chip"
      :title="quote.text"
      @click="session.removeQuote(quote.id)"
    >
      <span>{{ BLOCK_TYPE_LABELS[(store.blocks.value.find((block) => block.id === quote.blockId)?.type) ?? 'text'] }} · {{ quote.text }}</span>
      <AppIcon name="close" />
    </button>
  </div>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.08);
  color: var(--ink);
  font-size: 12px;
}
.chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip .app-icon { --icon-size: 12px; color: var(--muted); }
</style>
