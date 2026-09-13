<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { GraphEdgeType, GraphNode } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { EDGE_TYPE_LABELS } from '../../workspace/labels'
import CreateEdgeDialog from './CreateEdgeDialog.vue'
import CreateNodeDialog from './CreateNodeDialog.vue'
import GraphNodeCard from './GraphNodeCard.vue'

const NODE_W = 196
const NODE_H = 102

const { store, ui, createNode, moveNode, createEdge, openNote } = useWorkspaceActions()

const surface = ref<HTMLElement | null>(null)
const pan = reactive({ x: 48, y: 36 })
const zoom = ref(1)
const creatingNode = ref(false)
const pendingEdge = ref<{ source: string; target: string } | null>(null)
const drafts = reactive<Record<string, { x: number; y: number }>>({})
const preview = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

let drag:
  | { kind: 'pan'; x: number; y: number; panX: number; panY: number }
  | { kind: 'node'; id: string; ox: number; oy: number }
  | { kind: 'edge'; id: string }
  | null = null

const nodes = computed(() => store.graph.value.nodes)
const edges = computed(() => store.graph.value.edges)

function fallback(index: number): { x: number; y: number } {
  return { x: 80 + (index % 3) * 240, y: 80 + Math.floor(index / 3) * 160 }
}

function positionOf(node: GraphNode, index: number): { x: number; y: number } {
  return drafts[node.id] ?? node.position ?? fallback(index)
}

function noteTitle(node: GraphNode): string | undefined {
  if (!node.noteId) return undefined
  return store.notes.value.find((note) => note.id === node.noteId)?.title
}

function linkCount(nodeId: string): number {
  return edges.value.filter((edge) => edge.source === nodeId || edge.target === nodeId).length
}

function worldFromEvent(event: PointerEvent | WheelEvent): { x: number; y: number } {
  const rect = surface.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (event.clientX - rect.left - pan.x) / zoom.value,
    y: (event.clientY - rect.top - pan.y) / zoom.value,
  }
}

function edgePath(edge: { source: string; target: string }): string | null {
  const sourceIndex = nodes.value.findIndex((node) => node.id === edge.source)
  const targetIndex = nodes.value.findIndex((node) => node.id === edge.target)
  const source = nodes.value[sourceIndex]
  const target = nodes.value[targetIndex]
  if (!source || !target) return null
  const a = positionOf(source, sourceIndex)
  const b = positionOf(target, targetIndex)
  const x1 = a.x + NODE_W / 2
  const y1 = a.y + NODE_H
  const x2 = b.x + NODE_W / 2
  const y2 = b.y
  const mid = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
}

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const before = worldFromEvent(event)
  const next = Math.min(2, Math.max(0.4, zoom.value * (event.deltaY > 0 ? 0.92 : 1.08)))
  zoom.value = next
  const rect = surface.value?.getBoundingClientRect()
  if (!rect) return
  pan.x = event.clientX - rect.left - before.x * next
  pan.y = event.clientY - rect.top - before.y * next
}

function onBackgroundDown(event: PointerEvent): void {
  const target = event.target as HTMLElement
  const isBackground =
    target === surface.value ||
    target.classList.contains('world') ||
    target.classList.contains('edges') ||
    target.tagName === 'svg'
  if (!isBackground) return
  ui.selectNode(null)
  ui.selectEdge(null)
  drag = { kind: 'pan', x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
  surface.value?.setPointerCapture(event.pointerId)
}

function onNodeDown(node: GraphNode, index: number, event: PointerEvent): void {
  ui.selectNode(node.id)
  const pos = positionOf(node, index)
  const world = worldFromEvent(event)
  drag = { kind: 'node', id: node.id, ox: world.x - pos.x, oy: world.y - pos.y }
  surface.value?.setPointerCapture(event.pointerId)
}

function onConnectStart(node: GraphNode, event: PointerEvent): void {
  ui.selectNode(node.id)
  drag = { kind: 'edge', id: node.id }
  const world = worldFromEvent(event)
  const index = nodes.value.findIndex((item) => item.id === node.id)
  const pos = positionOf(node, index)
  preview.value = { x1: pos.x + NODE_W, y1: pos.y + NODE_H / 2, x2: world.x, y2: world.y }
  surface.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return
  if (drag.kind === 'pan') {
    pan.x = drag.panX + (event.clientX - drag.x)
    pan.y = drag.panY + (event.clientY - drag.y)
    return
  }
  const world = worldFromEvent(event)
  if (drag.kind === 'node') {
    drafts[drag.id] = { x: world.x - drag.ox, y: world.y - drag.oy }
    return
  }
  if (preview.value) {
    preview.value = { ...preview.value, x2: world.x, y2: world.y }
  }
}

async function onPointerUp(event: PointerEvent): Promise<void> {
  const current = drag
  drag = null
  if (!current) return

  if (current.kind === 'node') {
    const pos = drafts[current.id]
    if (pos) await moveNode(current.id, { x: Math.round(pos.x), y: Math.round(pos.y) })
    return
  }

  if (current.kind === 'edge') {
    const world = worldFromEvent(event)
    const target = nodes.value.find((node, index) => {
      if (node.id === current.id) return false
      const pos = positionOf(node, index)
      return world.x >= pos.x && world.x <= pos.x + NODE_W && world.y >= pos.y && world.y <= pos.y + NODE_H
    })
    preview.value = null
    if (target) pendingEdge.value = { source: current.id, target: target.id }
  }
}

function fit(): void {
  if (!surface.value || nodes.value.length === 0) {
    pan.x = 48
    pan.y = 36
    zoom.value = 1
    return
  }
  const boxes = nodes.value.map((node, index) => positionOf(node, index))
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + NODE_W))
  const maxY = Math.max(...boxes.map((box) => box.y + NODE_H))
  const width = maxX - minX
  const height = maxY - minY
  const rect = surface.value.getBoundingClientRect()
  const next = Math.min(1.2, Math.max(0.45, Math.min((rect.width - 80) / width, (rect.height - 80) / height)))
  zoom.value = next
  pan.x = (rect.width - width * next) / 2 - minX * next
  pan.y = (rect.height - height * next) / 2 - minY * next
}

function focusNode(id: string): void {
  const index = nodes.value.findIndex((node) => node.id === id)
  const node = nodes.value[index]
  if (!node || !surface.value) return
  const pos = positionOf(node, index)
  const rect = surface.value.getBoundingClientRect()
  pan.x = rect.width / 2 - (pos.x + NODE_W / 2) * zoom.value
  pan.y = rect.height / 2 - (pos.y + NODE_H / 2) * zoom.value
  ui.selectNode(id)
}

async function onCreateNode(label: string, type: Parameters<typeof createNode>[1]): Promise<void> {
  creatingNode.value = false
  const rect = surface.value?.getBoundingClientRect()
  const x = rect ? (rect.width / 2 - pan.x) / zoom.value - NODE_W / 2 : 160
  const y = rect ? (rect.height / 2 - pan.y) / zoom.value - NODE_H / 2 : 120
  await createNode(label, type, { x, y })
}

async function onCreateEdge(type: GraphEdgeType): Promise<void> {
  const pending = pendingEdge.value
  pendingEdge.value = null
  if (pending) await createEdge(pending.source, pending.target, type)
}

const pendingEnds = computed(() => {
  if (!pendingEdge.value) return { source: '', target: '' }
  return {
    source: nodes.value.find((node) => node.id === pendingEdge.value?.source)?.label ?? '',
    target: nodes.value.find((node) => node.id === pendingEdge.value?.target)?.label ?? '',
  }
})

watch(
  () => ui.focusNodeId.value,
  (id) => {
    if (!id) return
    void nextTick(() => {
      const target = ui.consumeFocusNode()
      if (target) focusNode(target)
    })
  },
)

onMounted(() => {
  void nextTick(() => {
    const pending = ui.focusNodeId.value
    if (pending) {
      focusNode(pending)
      ui.consumeFocusNode()
    } else {
      fit()
    }
  })
})
</script>

<template>
  <section class="canvas">
    <header class="toolbar">
      <div>
        <p class="kicker">Canvas</p>
        <h1>Knowledge Canvas</h1>
      </div>
      <div class="actions">
        <button type="button" class="primary" @click="creatingNode = true">＋ Node</button>
        <button type="button" class="ghost" @click="fit">Fit</button>
      </div>
    </header>

    <div
      ref="surface"
      class="surface"
      @wheel.prevent="onWheel"
      @pointerdown="onBackgroundDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
    >
      <div v-if="!nodes.length" class="empty" @pointerdown.stop>
        <h2>Your knowledge graph is empty.</h2>
        <p>Create a node to start connecting ideas.</p>
        <button type="button" class="primary" @click="creatingNode = true">＋ Create Node</button>
      </div>

      <div v-else class="world" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
        <svg class="edges" :width="4000" :height="3000">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8a29e" />
            </marker>
          </defs>
          <g v-for="edge in edges" :key="edge.id">
            <path
              :d="edgePath(edge) ?? ''"
              class="edge-hit"
              @pointerdown.stop="ui.selectEdge(edge.id)"
            />
            <path
              :d="edgePath(edge) ?? ''"
              class="edge"
              :class="{ selected: ui.selectedEdgeId.value === edge.id }"
              marker-end="url(#arrow)"
            />
          </g>
          <path
            v-if="preview"
            :d="`M ${preview.x1} ${preview.y1} L ${preview.x2} ${preview.y2}`"
            class="preview"
          />
        </svg>

        <GraphNodeCard
          v-for="(node, index) in nodes"
          :key="node.id"
          class="placed"
          :style="{ transform: `translate(${positionOf(node, index).x}px, ${positionOf(node, index).y}px)` }"
          :node="node"
          :selected="ui.selectedNodeId.value === node.id"
          :note-title="noteTitle(node)"
          :link-count="linkCount(node.id)"
          @pointerdown="onNodeDown(node, index, $event)"
          @open-note="node.noteId && openNote(node.noteId)"
          @connect="onConnectStart(node, $event)"
        />
      </div>

      <p v-if="nodes.length && !edges.length" class="hint">
        No connections yet. Drag the node handle to connect related ideas.
      </p>
    </div>

    <p v-if="ui.selectedEdgeId.value" class="edge-label">
      {{ EDGE_TYPE_LABELS[store.graph.value.edges.find((edge) => edge.id === ui.selectedEdgeId.value)?.type ?? 'relates'] }}
    </p>

    <CreateNodeDialog v-if="creatingNode" @create="onCreateNode" @cancel="creatingNode = false" />
    <CreateEdgeDialog
      v-if="pendingEdge"
      :source-label="pendingEnds.source"
      :target-label="pendingEnds.target"
      @create="onCreateEdge"
      @cancel="pendingEdge = null"
    />
  </section>
</template>

<style scoped>
.canvas {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  padding: 0.85rem 1rem 0.7rem;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 253, 248, 0.92);
}

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

h1 {
  margin: 0.1rem 0 0;
  font-family: var(--display);
  font-size: 1.25rem;
}

.actions {
  display: flex;
  gap: 0.4rem;
}

.surface {
  position: relative;
  flex: 1;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background:
    radial-gradient(circle at 20% 0%, rgba(239, 230, 213, 0.7), transparent 36%),
    #f4f1ea;
}

.world {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}

.edges {
  position: absolute;
  inset: 0;
  overflow: visible;
}

.edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 18;
  pointer-events: stroke;
  cursor: pointer;
}

.edge {
  fill: none;
  stroke: #a8a29e;
  stroke-width: 1.6;
  pointer-events: none;
}

.edge.selected {
  stroke: var(--accent);
  stroke-width: 2.2;
}

.preview {
  fill: none;
  stroke: var(--accent);
  stroke-dasharray: 5 4;
  stroke-width: 1.4;
}

.placed {
  position: absolute;
  top: 0;
  left: 0;
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 2.5rem;
  max-width: 28rem;
}

.empty h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.empty p {
  color: var(--muted);
}

.hint {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.edge-label {
  position: absolute;
  top: 4.6rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.2rem 0.7rem;
  font-size: 0.78rem;
  color: var(--muted);
}
</style>
