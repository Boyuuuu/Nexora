<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { GraphNode } from '../../data'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'

type Tone = 'current' | 'linked' | 'plain'

const VIEW = 240
const PAD = 36

const { store, ui, openNote, openCanvas } = useWorkspaceActions()

const surface = ref<HTMLElement | null>(null)
const pan = reactive({ x: 0, y: 0 })
const flashId = ref<string | null>(null)

let panDrag: { sx: number; sy: number; ox: number; oy: number } | null = null
let flashTimer: ReturnType<typeof setTimeout> | null = null
let centerRaf = 0

function fallback(index: number): { x: number; y: number } {
  return { x: 80 + (index % 3) * 220, y: 80 + Math.floor(index / 3) * 160 }
}

function positionOf(node: GraphNode, index: number): { x: number; y: number } {
  return node.position ?? fallback(index)
}

const worldNodes = computed(() => {
  const currentNoteId = store.note.value?.id
  return store.graph.value.nodes.map((node, index) => {
    const pos = positionOf(node, index)
    const tone: Tone =
      node.noteId && node.noteId === currentNoteId
        ? 'current'
        : node.noteId
          ? 'linked'
          : 'plain'
    return { ...node, x: pos.x, y: pos.y, tone }
  })
})

const fit = computed(() => {
  const points = worldNodes.value
  if (!points.length) {
    return { scale: 1, minX: 0, minY: 0, offsetX: 0, offsetY: 0 }
  }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 120)
  const spanY = Math.max(maxY - minY, 120)
  const inner = VIEW - PAD * 2
  const scale = Math.min(inner / spanX, inner / spanY)
  return {
    scale,
    minX,
    minY,
    offsetX: PAD + (inner - spanX * scale) / 2,
    offsetY: PAD + (inner - spanY * scale) / 2,
  }
})

function toLocal(x: number, y: number): { x: number; y: number } {
  return {
    x: fit.value.offsetX + (x - fit.value.minX) * fit.value.scale,
    y: fit.value.offsetY + (y - fit.value.minY) * fit.value.scale,
  }
}

const layout = computed(() => {
  const points = worldNodes.value.map((node) => {
    const local = toLocal(node.x, node.y)
    const radius = node.tone === 'current' ? 9 : node.tone === 'linked' ? 7 : 4
    return { ...node, lx: local.x, ly: local.y, radius }
  })
  const byId = new Map(points.map((node) => [node.id, node]))
  const edges = store.graph.value.edges
    .map((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) return null
      // Dim edges that only connect plain nodes
      const strong = source.tone !== 'plain' || target.tone !== 'plain'
      return {
        id: edge.id,
        x1: source.lx,
        y1: source.ly,
        x2: target.lx,
        y2: target.ly,
        strong,
      }
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null)

  return { points, edges, ready: points.length > 0 }
})

const currentLabel = computed(() => {
  return layout.value.points.find((node) => node.tone === 'current')?.label ?? null
})

function centerOnCurrent(smooth = true): void {
  const current = layout.value.points.find((node) => node.tone === 'current')
  const targetX = current ? VIEW / 2 - current.lx : 0
  const targetY = current ? VIEW / 2 - current.ly : 0

  if (!smooth) {
    pan.x = targetX
    pan.y = targetY
    return
  }

  cancelAnimationFrame(centerRaf)
  const fromX = pan.x
  const fromY = pan.y
  const started = performance.now()
  const duration = 280

  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / duration)
    const ease = 1 - (1 - t) ** 3
    pan.x = fromX + (targetX - fromX) * ease
    pan.y = fromY + (targetY - fromY) * ease
    if (t < 1) centerRaf = requestAnimationFrame(tick)
  }
  centerRaf = requestAnimationFrame(tick)
}

watch(
  () => store.note.value?.id,
  () => {
    // Wait a frame so layout updates with new current tone.
    requestAnimationFrame(() => centerOnCurrent(true))
  },
)

watch(
  () => store.workspace.value?.id,
  () => {
    pan.x = 0
    pan.y = 0
    requestAnimationFrame(() => centerOnCurrent(false))
  },
  { immediate: true },
)

watch(
  () => store.graph.value.nodes.map((node) => `${node.id}:${node.position?.x ?? ''}:${node.position?.y ?? ''}`).join('|'),
  () => {
    requestAnimationFrame(() => centerOnCurrent(false))
  },
)

function flash(nodeId: string): void {
  flashId.value = nodeId
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashId.value = null
  }, 520)
}

function onBackgroundDown(event: PointerEvent): void {
  const target = event.target as Element
  if (target.closest('.node') || target.closest('.dock')) return
  panDrag = {
    sx: event.clientX,
    sy: event.clientY,
    ox: pan.x,
    oy: pan.y,
  }
  surface.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!panDrag) return
  const rect = surface.value?.getBoundingClientRect()
  if (!rect) return
  pan.x = panDrag.ox + ((event.clientX - panDrag.sx) / rect.width) * VIEW
  pan.y = panDrag.oy + ((event.clientY - panDrag.sy) / rect.height) * VIEW
}

function onPointerUp(): void {
  panDrag = null
}

async function onNodeClick(node: (typeof layout.value.points)[number]): Promise<void> {
  if (!node.noteId) {
    ui.showToast('此节点还没有 Note')
    return
  }
  flash(node.id)
  await openNote(node.noteId)
}

function goCanvas(): void {
  const current = layout.value.points.find((node) => node.tone === 'current')
  void openCanvas(current?.id)
}
</script>

<template>
  <section class="mini">
    <div
      ref="surface"
      class="card"
      @pointerdown="onBackgroundDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="corners" aria-hidden="true">
        <span class="bl" />
        <span class="br" />
      </div>
      <header class="top">
        <div class="title">
          <span class="kicker">Map</span>
          <strong>{{ currentLabel ?? 'Knowledge graph' }}</strong>
        </div>
      </header>

      <div class="viewport">
        <svg
          v-if="layout.ready"
          class="map"
          :viewBox="`0 0 ${VIEW} ${VIEW}`"
          aria-label="Knowledge graph preview"
        >
          <g :transform="`translate(${pan.x} ${pan.y})`">
            <line
              v-for="edge in layout.edges"
              :key="edge.id"
              :x1="edge.x1"
              :y1="edge.y1"
              :x2="edge.x2"
              :y2="edge.y2"
              class="edge"
              :class="{ strong: edge.strong }"
            />
            <g
              v-for="node in layout.points"
              :key="node.id"
              class="node"
              :class="[node.tone, { flash: flashId === node.id }]"
              @pointerdown.stop
              @click.stop="onNodeClick(node)"
            >
              <title>
                {{ node.noteId ? node.label : `${node.label}（还没有 Note）` }}
              </title>
              <circle
                v-if="node.tone === 'current'"
                class="halo"
                :cx="node.lx"
                :cy="node.ly"
                r="16"
              />
              <!-- Larger invisible hit area -->
              <circle class="hit" :cx="node.lx" :cy="node.ly" r="16" />
              <circle class="dot" :cx="node.lx" :cy="node.ly" :r="node.radius" />
              <text v-if="node.tone !== 'plain'" :x="node.lx" :y="node.ly + node.radius + 11">
                {{ node.label }}
              </text>
            </g>
          </g>
        </svg>
        <p v-else class="empty">还没有节点</p>
      </div>

      <button type="button" class="dock" @pointerdown.stop @click="goCanvas">
        在 Canvas 中打开
      </button>
    </div>
  </section>
</template>

<style scoped>
.mini {
  width: 100%;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  aspect-ratio: 1 / 1;
  min-height: 200px;
  border: 0;
  border-radius: 4px;
  background: #fbf8f2;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

.card::before,
.card::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  pointer-events: none;
  z-index: 3;
  border: 1.5px solid rgba(120, 113, 108, 0.55);
}

.card::before {
  top: 6px;
  left: 6px;
  border-right: 0;
  border-bottom: 0;
}

.card::after {
  top: 6px;
  right: 6px;
  border-left: 0;
  border-bottom: 0;
}

.corners {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}

.corners span {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 1.5px solid rgba(120, 113, 108, 0.55);
}

.corners .bl {
  left: 6px;
  bottom: 6px;
  border-right: 0;
  border-top: 0;
}

.corners .br {
  right: 6px;
  bottom: 6px;
  border-left: 0;
  border-top: 0;
}

.card:active {
  cursor: grabbing;
}

.top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 0.7rem 0.8rem 0;
  pointer-events: none;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
}

.kicker {
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: #a8a29e;
}

.title strong {
  font-family: var(--display);
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 12rem;
}

.viewport {
  flex: 1;
  min-height: 0;
}

.map {
  width: 100%;
  height: 100%;
  display: block;
}

.edge {
  stroke: rgba(214, 211, 209, 0.35);
  stroke-width: 1;
}

.edge.strong {
  stroke: rgba(168, 162, 158, 0.55);
  stroke-width: 1.25;
}

.node {
  cursor: pointer;
}

.node .hit {
  fill: transparent;
}

.node .dot {
  stroke-width: 1.5;
  transition: r 160ms ease, fill 160ms ease, stroke 160ms ease;
}

.node.plain {
  opacity: 0.28;
  pointer-events: none;
}

.node.plain .dot {
  fill: #fff;
  stroke: #d6d3d1;
}

.node.linked .dot {
  fill: #f97316;
  stroke: #ea580c;
}

.node.current .dot {
  fill: #22c55e;
  stroke: #16a34a;
}

.node .halo {
  fill: rgba(34, 197, 94, 0.16);
}

.node.flash .halo {
  fill: rgba(34, 197, 94, 0.28);
}

.node.flash .dot {
  filter: brightness(1.08);
}

.node text {
  fill: #57534e;
  font-size: 9px;
  font-weight: 600;
  text-anchor: middle;
  pointer-events: none;
}

.node.linked:hover .dot,
.node.current:hover .dot {
  filter: brightness(1.06);
}

.empty {
  margin: 0;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 0.85rem;
}

.dock {
  position: absolute;
  left: 0.7rem;
  right: 0.7rem;
  bottom: 0.7rem;
  z-index: 2;
  border: 0;
  background: rgba(251, 248, 242, 0.82);
  color: var(--muted);
  border-radius: 8px;
  padding: 0.48rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
}

.dock:hover {
  color: var(--accent);
}
</style>
