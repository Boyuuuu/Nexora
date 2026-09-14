<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodePosition } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import type { CanvasScope } from '../../composables/useWorkspaceUi'
import { EDGE_TYPE_LABELS } from '../../workspace/labels'
import { arrangeGraph } from '../../workspace/canvasLayout'
import { connectionPath, curveBetween, fallbackPosition, fitViewport, NODE_H, NODE_W, portAt, type PortSide } from '../../workspace/canvasGeometry'
import IconButton from '../ui/IconButton.vue'
import CreateEdgeDialog from './CreateEdgeDialog.vue'
import CreateNodeDialog from './CreateNodeDialog.vue'
import GraphNodeCard from './GraphNodeCard.vue'

type Point = GraphNodePosition
type SavedPosition = { node_id: string; position: Point | null }

const props = defineProps<{ scope: CanvasScope }>()
type Drag =
  | { kind: 'pan'; pointer: number; x: number; y: number; panX: number; panY: number }
  | { kind: 'node'; pointer: number; id: string; ox: number; oy: number; x: number; y: number; moved: boolean }
  | { kind: 'edge'; pointer: number; id: string; side: PortSide }

const { store, ui, createNode, moveNode, moveNodes, createEdge, openNote } = useWorkspaceActions()
const surface = ref<HTMLElement | null>(null)
const pan = reactive({ x: 48, y: 36 })
const zoom = ref(1)
const creatingNode = ref(false)
const pendingEdge = ref<{ source: string; target: string } | null>(null)
const drafts = reactive<Record<string, Point>>({})
const connection = ref<{ id: string; side: PortSide; cursor: Point } | null>(null)
const dragKind = ref<Drag['kind'] | null>(null)
const draggingNode = ref<string | null>(null)
const saving = ref(false)
const arranging = ref(false)
const undoLayout = ref<SavedPosition[] | null>(null)
const arrowId = 'canvas-arrow-' + useId()
const activeArrowId = arrowId + '-active'
let drag: Drag | null = null
let pointerFrame = 0
let latestPointer: PointerEvent | null = null
let animationFrame = 0
let finishAnimation: (() => void) | null = null
let disposed = false
let followFit = true
let resizeObserver: ResizeObserver | null = null

const isWorkspaceScope = computed(() => props.scope.type === 'workspace')
const scopedNote = computed(() => {
  const noteId = props.scope.type === 'note' ? props.scope.noteId : null
  return noteId ? store.notes.value.find(note => note.id === noteId) ?? null : null
})
const nodes = computed<GraphNode[]>(() => {
  if (isWorkspaceScope.value) {
    return store.notes.value.map((note, index) => {
      const existing = store.graph.value.nodes.find(node => node.noteId === note.id)
      return {
        id: existing?.id ?? `note:${note.id}`,
        workspaceId: note.workspaceId,
        label: note.title,
        type: 'topic',
        noteId: note.id,
        position: existing?.position ?? fallbackPosition(index),
      }
    })
  }
  return (scopedNote.value?.blocks ?? []).map((block, index) => ({
    id: `block:${block.id}`,
    workspaceId: scopedNote.value!.workspaceId,
    label: ('title' in block.data && block.data.title) || `Block ${index + 1}`,
    type: block.type === 'math' ? 'mechanism' : block.type === 'code' ? 'component' : block.type === 'exploration' ? 'topic' : 'concept',
    noteId: scopedNote.value!.id,
    blockId: block.id,
    position: fallbackPosition(index),
  }))
})
const edges = computed<GraphEdge[]>(() => {
  if (!isWorkspaceScope.value) return []
  const noteIds = new Map(store.graph.value.nodes.map(node => [node.id, node.noteId]))
  const noteNodeIds = new Map(nodes.value.flatMap(node => node.noteId ? [[node.noteId, node.id] as const] : []))
  const seen = new Set<string>()
  return store.graph.value.edges.flatMap(edge => {
    const sourceNote = noteIds.get(edge.source), targetNote = noteIds.get(edge.target)
    if (!sourceNote || !targetNote || sourceNote === targetNote) return []
    const key = [sourceNote, targetNote].sort().join(':')
    if (seen.has(key)) return []
    seen.add(key)
    return [{ ...edge, id: `note-edge:${key}`, source: noteNodeIds.get(sourceNote) ?? `note:${sourceNote}`, target: noteNodeIds.get(targetNote) ?? `note:${targetNote}`, type: 'relates' as const }]
  })
})
const positions = computed(() => new Map(nodes.value.map((node, index) => [node.id, drafts[node.id] ?? node.position ?? fallbackPosition(index)])))
const notesById = computed(() => new Map(store.notes.value.map(note => [note.id, note.title])))
const links = computed(() => {
  const counts = new Map<string, number>()
  for (const edge of edges.value) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    if (edge.source !== edge.target) counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
  }
  return counts
})
const renderedEdges = computed(() => {
  const groups = new Map<string, string[]>()
  for (const edge of edges.value) {
    const key = JSON.stringify([edge.source, edge.target].sort())
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(edge.id)
  }
  const labels = new Map(nodes.value.map(node => [node.id, node.label]))
  return edges.value.flatMap(edge => {
    const a = positions.value.get(edge.source), b = positions.value.get(edge.target)
    if (!a || !b) return []
    const group = groups.get(JSON.stringify([edge.source, edge.target].sort()))!
    const lane = (group.indexOf(edge.id) - (group.length - 1) / 2) * 32 * (edge.source <= edge.target ? 1 : -1)
    return [{ ...edge, path: connectionPath(a, b, lane), label: (labels.get(edge.source) ?? '') + ' → ' + (labels.get(edge.target) ?? '') + ' · ' + EDGE_TYPE_LABELS[edge.type] }]
  })
})
const connectionTarget = computed(() => connection.value ? nodeAt(connection.value.cursor, connection.value.id) : undefined)
const previewPath = computed(() => {
  const current = connection.value
  if (!current) return ''
  const source = positions.value.get(current.id)
  if (!source) return ''
  const target = connectionTarget.value
  if (target) return connectionPath(source, positions.value.get(target.id)!)
  const a = portAt(source, current.side)
  return curveBetween(a, { ...current.cursor, nx: -a.nx, ny: -a.ny, side: current.side })
})
const interactionLocked = computed(() => saving.value || arranging.value || store.busy.value)

function nodeAt(point: Point, except: string): GraphNode | undefined {
  return [...nodes.value].reverse().find(node => {
    const pos = positions.value.get(node.id)!
    return node.id !== except && point.x >= pos.x && point.x <= pos.x + NODE_W && point.y >= pos.y && point.y <= pos.y + NODE_H
  })
}
function worldFromEvent(event: PointerEvent | WheelEvent): Point {
  const rect = surface.value?.getBoundingClientRect()
  return rect ? { x: (event.clientX - rect.left - pan.x) / zoom.value, y: (event.clientY - rect.top - pan.y) / zoom.value } : { x: 0, y: 0 }
}
function stopAnimation(): void {
  cancelAnimationFrame(animationFrame)
  animationFrame = 0
  finishAnimation?.()
  finishAnimation = null
}
function onWheel(event: WheelEvent): void {
  if (drag || interactionLocked.value) return
  stopAnimation()
  followFit = false
  const before = worldFromEvent(event)
  const next = Math.min(2, Math.max(Math.min(0.1, zoom.value), zoom.value * (event.deltaY > 0 ? 0.92 : 1.08)))
  const rect = surface.value?.getBoundingClientRect()
  if (!rect) return
  zoom.value = next
  pan.x = event.clientX - rect.left - before.x * next
  pan.y = event.clientY - rect.top - before.y * next
}
function beginDrag(current: Drag): void {
  stopAnimation()
  drag = current
  dragKind.value = current.kind
  surface.value?.setPointerCapture(current.pointer)
}
function onBackgroundDown(event: PointerEvent): void {
  if (event.button !== 0 || drag || interactionLocked.value) return
  const target = event.target as Element
  if (!target.matches('.surface, .world, .edges')) return
  ui.selectNode(null)
  followFit = false
  beginDrag({ kind: 'pan', pointer: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y })
}
function onNodeDown(node: GraphNode, event: PointerEvent): void {
  if (event.button !== 0 || drag || interactionLocked.value || !isWorkspaceScope.value) return
  const pos = positions.value.get(node.id)!, world = worldFromEvent(event)
  beginDrag({ kind: 'node', pointer: event.pointerId, id: node.id, ox: world.x - pos.x, oy: world.y - pos.y, x: event.clientX, y: event.clientY, moved: false })
}
function onConnectStart(node: GraphNode, event: PointerEvent, side: PortSide): void {
  if (event.button !== 0 || drag || interactionLocked.value) return
  followFit = false
  connection.value = { id: node.id, side, cursor: worldFromEvent(event) }
  beginDrag({ kind: 'edge', pointer: event.pointerId, id: node.id, side })
}
function applyPointer(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointer) return
  if (drag.kind === 'pan') {
    pan.x = drag.panX + event.clientX - drag.x
    pan.y = drag.panY + event.clientY - drag.y
  } else if (drag.kind === 'node') {
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return
    followFit = false
    drag.moved = true
    draggingNode.value = drag.id
    const world = worldFromEvent(event)
    drafts[drag.id] = { x: world.x - drag.ox, y: world.y - drag.oy }
  } else if (connection.value) connection.value.cursor = worldFromEvent(event)
}
function onPointerMove(event: PointerEvent): void {
  if (!drag || drag.pointer !== event.pointerId) return
  latestPointer = event
  if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0
    if (latestPointer) applyPointer(latestPointer)
    latestPointer = null
  })
}
function releaseDrag(): void {
  const pointer = drag?.pointer
  drag = null
  dragKind.value = null
  draggingNode.value = null
  cancelAnimationFrame(pointerFrame)
  pointerFrame = 0
  latestPointer = null
  if (pointer !== undefined && surface.value?.hasPointerCapture(pointer)) surface.value.releasePointerCapture(pointer)
}
async function onPointerUp(event: PointerEvent): Promise<void> {
  if (!drag || drag.pointer !== event.pointerId) return
  applyPointer(event)
  const current = drag
  releaseDrag()
  if (current.kind === 'node') {
    if (!current.moved) { ui.selectNode(current.id); return }
    const pos = drafts[current.id]!
    undoLayout.value = null
    saving.value = true
    try { await moveNode(current.id, { x: Math.round(pos.x), y: Math.round(pos.y) }) }
    finally { delete drafts[current.id]; saving.value = false }
  } else if (current.kind === 'edge') {
    const target = nodeAt(worldFromEvent(event), current.id)
    connection.value = null
    if (target) pendingEdge.value = { source: current.id, target: target.id }
  }
}
function cancelDrag(): void {
  if (drag?.kind === 'node') delete drafts[drag.id]
  if (drag?.kind === 'pan') { pan.x = drag.panX; pan.y = drag.panY }
  connection.value = null
  releaseDrag()
}
function viewportFor(points: Point[]) {
  const rect = surface.value?.getBoundingClientRect()
  return fitViewport(points, rect?.width ?? 800, rect?.height ?? 600)
}
function animateView(target: Point & { zoom: number }, targetPositions?: Map<string, Point>): Promise<void> {
  stopAnimation()
  const start = { x: pan.x, y: pan.y, zoom: zoom.value }, from = new Map(positions.value)
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300
  return new Promise(resolve => {
    finishAnimation = resolve
    const started = performance.now()
    function frame(now: number): void {
      const t = duration ? Math.min(1, (now - started) / duration) : 1
      const eased = 1 - Math.pow(1 - t, 3)
      pan.x = start.x + (target.x - start.x) * eased
      pan.y = start.y + (target.y - start.y) * eased
      zoom.value = start.zoom + (target.zoom - start.zoom) * eased
      targetPositions?.forEach((to, id) => {
        const p = from.get(id) ?? to
        drafts[id] = { x: p.x + (to.x - p.x) * eased, y: p.y + (to.y - p.y) * eased }
      })
      if (t < 1) animationFrame = requestAnimationFrame(frame)
      else { animationFrame = 0; finishAnimation = null; resolve() }
    }
    animationFrame = requestAnimationFrame(frame)
  })
}
function fit(animate = true): void {
  if (drag || arranging.value) return
  followFit = true
  const target = viewportFor([...positions.value.values()])
  if (animate) void animateView(target)
  else { stopAnimation(); pan.x = target.x; pan.y = target.y; zoom.value = target.zoom }
}
async function resetLayout(undo = false): Promise<void> {
  if (!nodes.value.length || interactionLocked.value || drag) return
  if (!isWorkspaceScope.value) {
    fit()
    ui.showToast('子图中的 Block 关系将在确认后显示。')
    return
  }
  stopAnimation()
  const before = nodes.value.map(node => ({ node_id: node.id, position: node.position ? { ...node.position } : null }))
  const arranged = arrangeGraph(store.graph.value)
  const updates = undo ? undoLayout.value : nodes.value.map(node => ({ node_id: node.id, position: arranged[node.id]! }))
  if (!updates) return
  const oldPositions = new Map(positions.value)
  oldPositions.forEach((pos, id) => { drafts[id] = { ...pos } })
  arranging.value = true
  try {
    const ok = await moveNodes(updates)
    if (!ok || disposed) return
    const targets = new Map(nodes.value.map((node, index) => [node.id, node.position ?? fallbackPosition(index)]))
    followFit = true
    await animateView(viewportFor([...targets.values()]), targets)
    undoLayout.value = undo ? null : before
    ui.showToast(undo ? '已恢复复位前的布局。' : '已整理布局，节点和连接均已保留。')
  } finally {
    for (const id of Object.keys(drafts)) delete drafts[id]
    arranging.value = false
  }
}
function focusNode(id: string): void {
  const pos = positions.value.get(id), rect = surface.value?.getBoundingClientRect()
  if (!pos || !rect) return
  followFit = false
  void animateView({ x: rect.width / 2 - (pos.x + NODE_W / 2) * zoom.value, y: rect.height / 2 - (pos.y + NODE_H / 2) * zoom.value, zoom: zoom.value })
  ui.selectNode(id)
}
function selectScopedNode(node: GraphNode): void {
  if (props.scope.type === 'workspace' && node.noteId) {
    ui.setCanvasScope({ type: 'note', noteId: node.noteId })
    ui.setMode('canvas')
    return
  }
  if (props.scope.type === 'note' && node.blockId) {
    ui.setMode('note')
    ui.selectBlock(node.blockId)
    return
  }
  ui.selectNode(node.id)
}
function openScopedNote(node: GraphNode): void {
  if (props.scope.type === 'workspace' && node.noteId) {
    ui.setCanvasScope({ type: 'note', noteId: node.noteId })
    ui.setMode('canvas')
    return
  }
  if (node.noteId) void openNote(node.noteId)
}
function backToWorkspaceGraph(): void {
  ui.setCanvasScope({ type: 'workspace' })
  ui.setMode('canvas')
}
async function ensureWorkspaceNoteNodes(): Promise<void> {
  if (!isWorkspaceScope.value || !store.workspace.value) return
  for (const [index, note] of store.notes.value.entries()) {
    if (store.graph.value.nodes.some(node => node.noteId === note.id)) continue
    await createNode(note.title, 'topic', fallbackPosition(index), { id: `note:${note.id}`, noteId: note.id })
  }
  ui.selectNode(null)
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
const pendingEnds = computed(() => ({
  source: nodes.value.find(node => node.id === pendingEdge.value?.source)?.label ?? '',
  target: nodes.value.find(node => node.id === pendingEdge.value?.target)?.label ?? '',
}))

watch(() => ui.focusNodeId.value, id => {
  if (id) void nextTick(() => { const target = ui.consumeFocusNode(); if (target) focusNode(target) })
})
watch(() => JSON.stringify([nodes.value.map(node => [node.id, node.position]), edges.value.map(edge => [edge.id, edge.source, edge.target])]), () => {
  if (!arranging.value) undoLayout.value = null
})
onMounted(() => {
  void nextTick(() => {
    void (async () => {
      await ensureWorkspaceNoteNodes()
      const pending = ui.consumeFocusNode()
      if (pending) focusNode(pending)
      else fit(false)
      resizeObserver = new ResizeObserver(() => { if (followFit && !drag && !arranging.value) fit(false) })
      if (surface.value) resizeObserver.observe(surface.value)
    })()
  })
})
onBeforeUnmount(() => {
  disposed = true
  cancelDrag()
  stopAnimation()
  resizeObserver?.disconnect()
})
</script>

<template>
  <section class="canvas" :aria-busy="arranging || saving">
    <header class="toolbar">
      <div class="heading">
        <nav v-if="!isWorkspaceScope" class="breadcrumbs" aria-label="图谱层级">
          <button type="button" @click="backToWorkspaceGraph">Workspace 总图</button>
          <span aria-hidden="true">›</span>
          <strong>{{ scopedNote?.title ?? 'Note 子图' }}</strong>
        </nav>
        <h1>{{ isWorkspaceScope ? 'Workspace 总图' : `${scopedNote?.title ?? 'Note'} · Block 子图` }}</h1>
        <p>{{ nodes.length }} 个节点 <span>·</span> {{ edges.length }} 条连接</p>
      </div>
      <div class="actions">
        <IconButton v-if="isWorkspaceScope" class="canvas-button" icon="plus" text="节点" label="新建节点" :disabled="interactionLocked" @click="creatingNode = true" />
        <IconButton class="canvas-button" icon="reset" text="一键复位" label="自动整理节点并居中" :disabled="!nodes.length || interactionLocked || !!dragKind" @click="resetLayout()" />
      </div>
    </header>
    <div
      ref="surface"
      class="surface"
      :class="{ 'is-dragging': dragKind, arranging }"
      @wheel.prevent="onWheel"
      @pointerdown="onBackgroundDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="cancelDrag"
      @lostpointercapture="drag && cancelDrag()"
      @keydown.esc="cancelDrag"
    >
      <div v-if="!nodes.length" class="empty" @pointerdown.stop>
        <h2>连接你的知识</h2>
        <p>从一个节点开始，拖动连接点建立关系。</p>
        <button type="button" class="primary" @click="creatingNode = true">新建节点</button>
      </div>
      <div v-else class="world" :style="{ transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')' }">
        <svg class="edges" width="100%" height="100%" aria-label="知识图谱连接">
          <defs>
            <marker v-for="active in [false, true]" :id="active ? activeArrowId : arrowId" :key="String(active)" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 1 1 L 9 5 L 1 9" fill="none" :stroke="active ? 'var(--accent)' : '#aaa69e'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </marker>
          </defs>
          <g v-for="edge in renderedEdges" :key="edge.id" class="edge-group" :class="{ selected: ui.selectedEdgeId.value === edge.id }" :style="{ '--arrow': 'url(#' + arrowId + ')', '--active-arrow': 'url(#' + activeArrowId + ')' }">
            <title>{{ edge.label }}</title>
            <path :d="edge.path" class="edge-hit" role="button" tabindex="0" :aria-label="edge.label" @pointerdown.stop @click.stop="ui.selectEdge(edge.id)" @keydown.enter.prevent="ui.selectEdge(edge.id)" @keydown.space.prevent="ui.selectEdge(edge.id)" />
            <path :d="edge.path" class="edge" />
          </g>
          <path v-if="connection" :d="previewPath" class="preview" :marker-end="'url(#' + activeArrowId + ')'" />
        </svg>
        <GraphNodeCard
          v-for="node in nodes" :key="node.id" class="placed"
          :style="{ transform: 'translate(' + positions.get(node.id)!.x + 'px, ' + positions.get(node.id)!.y + 'px)' }"
          :node="node" :selected="ui.selectedNodeId.value === node.id"
          :dragging="draggingNode === node.id" :connecting="!!connection" :drop-target="connectionTarget?.id === node.id"
          :readonly="!isWorkspaceScope" :note-title="node.noteId ? notesById.get(node.noteId) : undefined" :link-count="links.get(node.id) ?? 0"
          @pointerdown="onNodeDown(node, $event)" @select="selectScopedNode(node)"
          @open-note="openScopedNote(node)" @connect="(event, side) => onConnectStart(node, event, side)"
        />
      </div>
      <div v-if="nodes.length" class="view-controls" @pointerdown.stop>
        <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
        <IconButton icon="fit" label="居中显示全部节点" :disabled="interactionLocked || !!dragKind" @click="fit()" />
        <IconButton v-if="undoLayout" icon="undo" text="撤销复位" label="恢复复位前的布局" :disabled="interactionLocked" @click="resetLayout(true)" />
      </div>
      <p v-if="connection" class="hint">拖到目标节点后松开，Esc 取消</p>
      <p v-else-if="nodes.length && !edges.length && isWorkspaceScope" class="hint">拖动节点四周的连接点，建立关系</p>
      <p v-else-if="nodes.length && !edges.length" class="hint">Block 节点已生成，AI 关系建议确认后会显示在这里。</p>
    </div>
    <CreateNodeDialog v-if="creatingNode" @create="onCreateNode" @cancel="creatingNode = false" />
    <CreateEdgeDialog v-if="pendingEdge" :source-label="pendingEnds.source" :target-label="pendingEnds.target" @create="onCreateEdge" @cancel="pendingEdge = null" />
  </section>
</template>

<style scoped>
.canvas { position: relative; height: 100%; display: flex; flex-direction: column; min-height: 0; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); background: var(--panel); z-index: 4; }
.heading { min-width: 0; }
.breadcrumbs { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; color: var(--muted); font-size: 12px; }
.breadcrumbs button { border: 0; padding: 0; background: transparent; color: var(--accent); font-size: inherit; }
.breadcrumbs button:hover { text-decoration: underline; }
.breadcrumbs strong { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
h1 { margin: 0; font: 600 18px/1.4 var(--sans); }
.heading p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
.heading p span { margin: 0 5px; }
.actions { display: flex; gap: 8px; flex: none; }
.canvas-button { border: 1px solid var(--line); color: var(--ink); }
.surface { position: relative; flex: 1; min-height: 0; overflow: hidden; touch-action: none; cursor: grab; background-color: var(--bg); background-image: radial-gradient(#d7d2c9 0.8px, transparent 0.8px); background-size: 22px 22px; }
.surface.is-dragging { cursor: grabbing; user-select: none; }
.world { position: absolute; inset: 0; transform-origin: 0 0; }
.edges { position: absolute; inset: 0; overflow: visible; }
.edge-hit { fill: none; stroke: transparent; stroke-width: 18px; vector-effect: non-scaling-stroke; pointer-events: stroke; cursor: pointer; outline: none; }
.edge { fill: none; stroke: #aaa69e; stroke-width: 1.6px; vector-effect: non-scaling-stroke; pointer-events: none; marker-end: var(--arrow); transition: stroke 140ms ease, stroke-width 140ms ease; }
.edge-group:hover .edge, .edge-group:focus-within .edge, .edge-group.selected .edge { stroke: var(--accent); stroke-width: 2.5px; marker-end: var(--active-arrow); }
.preview { fill: none; stroke: var(--accent); stroke-dasharray: 6 5; stroke-width: 2px; vector-effect: non-scaling-stroke; pointer-events: none; }
.placed { position: absolute; top: 0; left: 0; }
.arranging .world { pointer-events: none; }
.empty { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 32px; }
.empty h2 { font: 600 22px/1.4 var(--sans); }
.empty p { color: var(--muted); font-size: 14px; }
.hint { position: absolute; left: 50%; bottom: 68px; transform: translateX(-50%); margin: 0; color: var(--muted); font-size: 12px; pointer-events: none; text-align: center; width: max-content; max-width: 90%; }
.view-controls { position: absolute; bottom: 16px; left: 16px; display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); box-shadow: 0 2px 10px rgba(28, 25, 23, 0.04); cursor: default; }
.zoom-value { padding: 0 8px; min-width: 52px; text-align: center; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.view-controls :deep(.icon-button::after) { top: auto; bottom: calc(100% + 8px); }
@media (max-width: 560px) { .toolbar { padding: 12px; gap: 8px; flex-wrap: wrap; } h1 { font-size: 16px; } .actions { gap: 4px; } }
@media (prefers-reduced-motion: reduce) { .edge { transition: none; } }
</style>
