<script setup lang="ts">
import { ref } from 'vue'
import type { GraphEdgeType } from '../../data'
import { EDGE_TYPE_LABELS, EDGE_TYPE_OPTIONS } from '../../workspace/labels'

defineProps<{
  sourceLabel: string
  targetLabel: string
}>()

const emit = defineEmits<{
  create: [type: GraphEdgeType]
  cancel: []
}>()

const type = ref<GraphEdgeType>('relates')
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <form class="dialog" @submit.prevent="emit('create', type)">
      <h2>Relationship</h2>
      <p>{{ sourceLabel }} → {{ targetLabel }}</p>
      <label>
        Type
        <select v-model="type">
          <option v-for="option in EDGE_TYPE_OPTIONS" :key="option" :value="option">
            {{ EDGE_TYPE_LABELS[option] }}
          </option>
        </select>
      </label>
      <div class="actions">
        <button type="button" class="ghost" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary">Create</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(28, 25, 23, 0.2);
  display: grid;
  place-items: center;
  z-index: 12;
}

.dialog {
  width: min(100% - 2rem, 360px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.15rem 1.2rem;
}

h2 {
  margin: 0;
  font-family: var(--display);
}

p {
  margin: 0.4rem 0 0.85rem;
  color: var(--muted);
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--muted);
}

select {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  color: var(--ink);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
  margin-top: 0.9rem;
}
</style>
