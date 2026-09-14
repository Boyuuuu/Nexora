<script setup lang="ts">
import type { GraphNode } from '../../data'
import { NODE_TYPE_LABELS } from '../../workspace/labels'
import { NODE_H, NODE_W, PORT_SIDES, type PortSide } from '../../workspace/canvasGeometry'

defineProps<{
  node: GraphNode
  selected: boolean
  dragging: boolean
  connecting: boolean
  dropTarget: boolean
  noteTitle?: string
  linkCount: number
  readonly?: boolean
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  select: []
  openNote: []
  connect: [event: PointerEvent, side: PortSide]
}>()
const sideLabels = { top: '上', right: '右', bottom: '下', left: '左' }
</script>

<template>
  <article
    class="node"
    :class="{ selected, dragging, connecting, 'drop-target': dropTarget }"
    :style="{ width: NODE_W + 'px', height: NODE_H + 'px' }"
    :aria-label="node.label"
    :data-node-id="node.id"
    tabindex="0"
    @pointerdown="emit('pointerdown', $event)"
    @keydown.enter.self.prevent="emit('select')"
    @keydown.space.self.prevent="emit('select')"
  >
    <p class="label" :title="node.label"><span class="dot" /><span>{{ node.label }}</span></p>
    <p class="type">{{ NODE_TYPE_LABELS[node.type] }}</p>
    <div class="meta">
      <button v-if="noteTitle" type="button" class="open" :title="noteTitle" @pointerdown.stop @click.stop="emit('openNote')">
        打开 Note <span aria-hidden="true">↗</span>
      </button>
      <span v-else>未关联 Note</span>
      <span>{{ linkCount }} 条连接</span>
    </div>
    <template v-if="!readonly">
      <button
        v-for="side in PORT_SIDES"
        :key="side"
        type="button"
        class="port"
        :class="'port-' + side"
        :aria-label="node.label + '：从' + sideLabels[side] + '侧拖动连接'"
        title="拖动到另一个节点以建立连接"
        tabindex="-1"
        @pointerdown.stop="emit('connect', $event, side)"
      />
    </template>
  </article>
</template>

<style scoped>
.node {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(28, 25, 23, 0.04);
  cursor: grab;
  user-select: none;
  position: relative;
  display: flex;
  flex-direction: column;
  transform-origin: center;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
}
.node:hover, .node:focus-visible {
  transform: scale(1.02);
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(15, 118, 110, 0.12);
  outline: none;
  z-index: 2;
}
.node.selected, .node.drop-target {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}
.node.dragging {
  transform: scale(1.03);
  cursor: grabbing;
  border-color: var(--accent);
  box-shadow: 0 12px 28px rgba(15, 118, 110, 0.18);
  z-index: 3;
}
.node.drop-target { background: #f0faf5; }
.label { margin: 0; font: 600 15px/22px var(--sans); display: flex; align-items: center; gap: 8px; }
.label > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; }
.type { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.meta { margin-top: auto; display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 12px; }
.open { border: 0; border-radius: 4px; background: transparent; color: var(--accent); padding: 0; font-size: 12px; }
.open:hover { text-decoration: underline; }
.open:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.port {
  position: absolute; width: 20px; height: 20px; padding: 0; border: 0;
  background: transparent; cursor: crosshair; opacity: 0;
  transform: translate(-50%, -50%); transition: opacity 140ms ease;
}
.port::after { content: ''; position: absolute; inset: 5px; border: 1.5px solid var(--accent); border-radius: 50%; background: var(--panel); transition: background-color 140ms ease; }
.port:hover::after { background: var(--accent); }
.port-top { top: 0; left: 50%; }
.port-right { top: 50%; left: 100%; }
.port-bottom { top: 100%; left: 50%; }
.port-left { top: 50%; left: 0; }
.node:hover .port, .node:focus-within .port, .node.selected .port, .node.connecting .port { opacity: 1; }
@media (hover: none) { .port { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .node, .port, .port::after { transition: none; } }
</style>
