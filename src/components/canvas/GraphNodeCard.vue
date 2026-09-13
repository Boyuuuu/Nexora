<script setup lang="ts">
import type { GraphNode } from '../../data'
import { NODE_TYPE_LABELS } from '../../workspace/labels'

defineProps<{
  node: GraphNode
  selected: boolean
  noteTitle?: string
  linkCount: number
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  openNote: []
  connect: [event: PointerEvent]
}>()
</script>

<template>
  <article class="node" :class="{ selected }" @pointerdown="emit('pointerdown', $event)">
    <p class="label"><span class="dot" />{{ node.label }}</p>
    <p class="type">{{ NODE_TYPE_LABELS[node.type] }}</p>
    <p class="meta">
      {{ noteTitle ? '1 note' : 'No note' }} · {{ linkCount }} {{ linkCount === 1 ? 'link' : 'links' }}
    </p>
    <button v-if="noteTitle" type="button" class="open" @pointerdown.stop @click.stop="emit('openNote')">
      Open Note →
    </button>
    <button type="button" class="port" aria-label="Create relationship" @pointerdown.stop="emit('connect', $event)" />
  </article>
</template>

<style scoped>
.node {
  width: 196px;
  min-height: 102px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem 0.8rem 0.7rem;
  box-shadow: 0 8px 20px rgba(28, 25, 23, 0.04);
  cursor: grab;
  user-select: none;
  position: relative;
}

.node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.label {
  margin: 0;
  font-family: var(--display);
  font-size: 1.05rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}

.type,
.meta {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.open {
  margin-top: 0.45rem;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-weight: 600;
  padding: 0;
  font-size: 0.82rem;
}

.port {
  position: absolute;
  right: -7px;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: #fff;
  padding: 0;
  transform: translateY(-50%);
  cursor: crosshair;
}
</style>
