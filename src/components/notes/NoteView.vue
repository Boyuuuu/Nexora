<script setup lang="ts">
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import AddBlockButton from './AddBlockButton.vue'
import BlockCard from './BlockCard.vue'
import NoteHeader from './NoteHeader.vue'

const { store, ui, createNote, dropBlockBefore } = useWorkspaceActions()

async function onDropBefore(blockId: string, event: DragEvent): Promise<void> {
  const dragged = event.dataTransfer?.getData('text/nexora-block')
  if (dragged) await dropBlockBefore(dragged, blockId)
}
</script>

<template>
  <section class="note-view">
    <template v-if="store.note.value">
      <NoteHeader />
      <div v-if="store.blocks.value.length" class="blocks">
        <BlockCard
          v-for="block in store.blocks.value"
          :key="block.id"
          :block="block"
          :active="ui.selectedBlockId.value === block.id"
          @activate="ui.selectBlock(block.id)"
          @drop-before="onDropBefore(block.id, $event)"
        />
      </div>
      <p v-else class="empty-blocks">This note has no blocks yet. Start with a concept, an intuition, or a question.</p>
      <AddBlockButton />
    </template>

    <div v-else class="empty">
      <p class="kicker">Note</p>
      <h1>Your knowledge starts here.</h1>
      <p>Create your first note.</p>
      <button type="button" class="primary" @click="createNote">＋ New Note</button>
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

.empty .primary {
  align-self: flex-start;
  margin-top: 1.1rem;
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
