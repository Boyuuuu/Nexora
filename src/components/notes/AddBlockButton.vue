<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { BlockType } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { ADDABLE_BLOCK_TYPES, BLOCK_TYPE_LABELS } from '../../workspace/labels'

const { createBlock } = useWorkspaceActions()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDoc(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

async function add(type: BlockType): Promise<void> {
  open.value = false
  await createBlock(type)
}
</script>

<template>
  <div ref="root" class="add">
    <button type="button" class="ghost" @click="open = !open">＋ Add block</button>
    <div v-if="open" class="chooser">
      <button v-for="type in ADDABLE_BLOCK_TYPES" :key="type" type="button" @click="add(type)">
        {{ BLOCK_TYPE_LABELS[type] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.add {
  position: relative;
  margin-top: 0.35rem;
}

.chooser {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.55rem;
}

.chooser button {
  background: #fff;
}
</style>
