<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { useAiEditor } from '../../composables/useAiEditor'
import { useAiSession } from '../../ai/session'
import { previewLabel } from '../../ai/protocol'
import AddBlockButton from './AddBlockButton.vue'
import BlockCard from './BlockCard.vue'
import NoteHeader from './NoteHeader.vue'
import QuoteToolbar from './QuoteToolbar.vue'

const { store, ui, dropBlockBefore } = useWorkspaceActions()
const editor = useAiEditor()
const session = useAiSession()

async function onDropBefore(blockId: string, event: DragEvent): Promise<void> {
  const dragged = event.dataTransfer?.getData('text/nexora-block')
  if (dragged) await dropBlockBefore(dragged, blockId)
}

const lastId = computed(() => store.blocks.value.at(-1)?.id ?? null)

function ghostLabel(type?: string): string {
  return type ? `新增 ${type}` : '新增块'
}
</script>

<template>
  <section class="note-view">
    <QuoteToolbar />
    <template v-if="store.note.value">
      <NoteHeader />
      <div v-if="store.blocks.value.length || session.ghostAfter(null).length" class="blocks">
        <article
          v-for="(ghost, index) in session.ghostAfter(null)"
          :key="`ghost-head-${index}`"
          class="ghost"
        >
          {{ previewLabel(ghost.action) }} · {{ ghostLabel(ghost.type) }}
        </article>
        <template v-for="block in store.blocks.value" :key="block.id">
          <BlockCard
            :block="block"
            :active="ui.selectedBlockId.value === block.id"
            :preview="session.patchFor(block.id)?.action"
            :can-undo="editor.lastTask.value?.noteId === store.note.value.id && editor.lastTask.value.changes.some((item) => item.blockId === block.id)"
            @activate="ui.selectBlock(block.id)"
            @drop-before="onDropBefore(block.id, $event)"
            @undo-ai="editor.undoBlock(block.id)"
          />
          <article
            v-for="(ghost, index) in session.ghostAfter(block.id, { last: block.id === lastId })"
            :key="`ghost-${block.id}-${index}`"
            class="ghost"
          >
            {{ previewLabel(ghost.action) }} · {{ ghostLabel(ghost.type) }}
          </article>
        </template>
      </div>
      <p v-else class="empty-blocks">This note has no blocks yet. Start with a concept, an intuition, or a question.</p>
      <AddBlockButton />
    </template>

    <div v-else class="empty">
      <p class="kicker">Note</p>
      <h1>Your knowledge starts here.</h1>
      <p>点击侧边栏 Notes 右侧的 ＋，创建这个工作区的第一篇笔记。</p>
    </div>
  </section>
</template>

<style scoped>
.note-view {
  max-width: 760px;
  margin: 0 auto;
  padding: 1.75rem clamp(1rem, 3vw, 1.75rem) 3.5rem;
  padding-right: clamp(1.25rem, 3.5vw, 2rem);
}

.blocks {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ghost {
  margin: 0.15rem 0;
  padding: 0.55rem 0.75rem;
  border: 1px dashed var(--accent);
  border-radius: 10px;
  color: var(--accent);
  font-size: 13px;
  background: rgba(15, 118, 110, 0.05);
}

.empty,
.empty-blocks {
  color: var(--muted);
}

.empty {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 28rem;
}

.empty h1 {
  margin: 0.2rem 0 0;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 2.8rem);
  color: var(--ink);
}

.empty p,
.empty-blocks {
  margin: 0.7rem 0 0;
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
}

.empty-blocks {
  padding: 1rem 0.2rem;
}
</style>
