<script setup lang="ts">
import { ref } from 'vue'
import type { GraphNodeType } from '../../data'
import { NODE_TYPE_LABELS, NODE_TYPE_OPTIONS } from '../../workspace/labels'

const emit = defineEmits<{
  create: [label: string, type: GraphNodeType]
  cancel: []
}>()

const label = ref('')
const type = ref<GraphNodeType>('concept')

function submit(): void {
  emit('create', label.value.trim() || 'Untitled', type.value)
}
</script>

<template>
  <div class="overlay" @click.self="emit('cancel')">
    <form class="dialog" @submit.prevent="submit">
      <h2>Create Knowledge Node</h2>
      <label>
        Name
        <input v-model="label" type="text" placeholder="Attention" autofocus />
      </label>
      <label>
        Type
        <select v-model="type">
          <option v-for="option in NODE_TYPE_OPTIONS" :key="option" :value="option">
            {{ NODE_TYPE_LABELS[option] }}
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
  margin: 0 0 0.85rem;
  font-family: var(--display);
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.7rem;
  font-size: 0.85rem;
  color: var(--muted);
}

input,
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
  margin-top: 0.4rem;
}
</style>
