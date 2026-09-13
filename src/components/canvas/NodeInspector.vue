<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceActions } from '../../composables/useWorkspaceActions'
import { EDGE_TYPE_LABELS, NODE_TYPE_LABELS } from '../../workspace/labels'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'

const { store, ui, openNote, deleteNode, deleteEdge, updateNode } = useWorkspaceActions()
const node = computed(() => store.graph.value.nodes.find(item => item.id === ui.selectedNodeId.value) ?? null)
const edge = computed(() => store.graph.value.edges.find(item => item.id === ui.selectedEdgeId.value) ?? null)
const nodesById = computed(() => new Map(store.graph.value.nodes.map(item => [item.id, item])))
const relatedNote = computed(() => store.notes.value.find(item => item.id === node.value?.noteId) ?? null)
const connections = computed(() => node.value ? store.graph.value.edges
  .filter(item => item.source === node.value!.id || item.target === node.value!.id)
  .map(item => {
    const outgoing = item.source === node.value!.id
    return { edge: item, label: nodesById.value.get(outgoing ? item.target : item.source)?.label ?? '—', outgoing }
  }) : [])
const edgeEnds = computed(() => edge.value ? [
  { label: '起点', node: nodesById.value.get(edge.value.source) },
  { label: '终点', node: nodesById.value.get(edge.value.target) },
] : [])
const title = computed(() => node.value?.label ?? (edge.value ? EDGE_TYPE_LABELS[edge.value.type] : ''))
const typeLabel = computed(() => node.value ? NODE_TYPE_LABELS[node.value.type] : '有向关系')
async function onLinkNote(event: Event): Promise<void> {
  if (node.value) await updateNode(node.value.id, { note_id: (event.target as HTMLSelectElement).value || null })
}
function close(): void { ui.selectNode(null) }
function remove(): void {
  if (node.value) void deleteNode(node.value.id)
  else if (edge.value) void deleteEdge(edge.value.id)
}
</script>

<template>
  <aside v-if="node || edge" class="inspector" aria-label="画布详情">
    <header class="inspector-header">
      <div class="panel-title"><AppIcon :name="node ? 'canvas' : 'connection'" /><span>{{ node ? '节点详情' : '连接详情' }}</span></div>
      <IconButton icon="close" label="关闭详情" tooltip-align="end" @click="close" />
    </header>
    <div class="inspector-body nexora-scroll">
      <section class="summary">
        <h2>{{ title }}</h2>
        <span class="type-badge">{{ typeLabel }}</span>
      </section>
      <template v-if="node">
        <section class="field-section">
          <label for="canvas-related-note" class="field-title">关联 Note</label>
          <select id="canvas-related-note" :value="node.noteId ?? ''" :disabled="store.busy.value" @change="onLinkNote">
            <option value="">未关联</option>
            <option v-for="item in store.notes.value" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
          <button v-if="relatedNote" type="button" class="detail-row open-note" @click="openNote(relatedNote.id)">
            <AppIcon name="note" /><span>打开 {{ relatedNote.title }}</span><span aria-hidden="true">↗</span>
          </button>
        </section>
        <section class="field-section">
          <div class="field-title">连接 <span class="count">{{ connections.length }}</span></div>
          <ul v-if="connections.length">
            <li v-for="item in connections" :key="item.edge.id">
              <button type="button" class="detail-row" @click="ui.selectEdge(item.edge.id)">
                <span class="direction" aria-hidden="true">{{ item.outgoing ? '↗' : '↙' }}</span>
                <span class="row-copy"><span>{{ item.label }}</span><small>{{ EDGE_TYPE_LABELS[item.edge.type] }}</small></span>
                <AppIcon name="chevron" />
              </button>
            </li>
          </ul>
          <p v-else class="empty">暂无连接</p>
        </section>
      </template>
      <section v-else-if="edge" class="field-section">
        <div class="field-title">连接节点</div>
        <ul>
          <li v-for="endpoint in edgeEnds" :key="endpoint.label">
            <button type="button" class="detail-row endpoint" :disabled="!endpoint.node" @click="endpoint.node && ui.requestFocusNode(endpoint.node.id)">
              <span class="endpoint-label">{{ endpoint.label }}</span>
              <span class="row-copy"><span>{{ endpoint.node?.label ?? '—' }}</span><small>{{ endpoint.node ? NODE_TYPE_LABELS[endpoint.node.type] : '' }}</small></span>
              <AppIcon name="chevron" />
            </button>
          </li>
        </ul>
      </section>
    </div>
    <footer class="inspector-footer">
      <button type="button" class="delete-button" :disabled="store.busy.value" @click="remove">
        <AppIcon name="trash" /><span>Delete</span>
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.inspector { width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--panel); }
.inspector-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); flex: none; }
.panel-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; --icon-size: 18px; }
.panel-title :deep(svg) { color: var(--muted); }
.inspector-body { flex: 1; min-height: 0; overflow: auto; padding: 20px 16px; }
.summary { margin: 0; }
h2 { margin: 0 0 10px; font: 600 20px/1.4 var(--sans); overflow-wrap: anywhere; color: var(--ink); }
.type-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; background: var(--control-hover); font-size: 12px; color: var(--muted); }
.field-section { margin-top: 24px; }
.field-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
.count { font-weight: 400; }
select { width: 100%; height: var(--control-size); border: 1px solid var(--line); border-radius: var(--control-radius); padding: 0 10px; background: var(--panel); color: var(--ink); font: 14px var(--sans); text-overflow: ellipsis; }
select:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.detail-row { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; border-radius: var(--control-radius); background: transparent; padding: 10px 8px; text-align: left; font: 14px/1.4 var(--sans); --icon-size: 16px; }
.detail-row:hover:not(:disabled) { background: var(--control-hover); }
.detail-row :deep(svg:last-child) { color: var(--muted); margin-left: auto; }
.row-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
.row-copy small { font-size: 12px; color: var(--muted); }
.direction { color: var(--accent); }
.endpoint-label { align-self: flex-start; padding-top: 2px; font-size: 12px; color: var(--muted); flex: none; }
.open-note { margin-top: 6px; color: var(--accent); }
.open-note > span:first-of-type { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.empty { margin: 0; padding: 12px 0; color: var(--muted); font-size: 13px; }
.inspector-footer { border-top: 1px solid var(--line); padding: 12px 16px; flex: none; }
.delete-button { display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; height: var(--control-size); padding: 0 12px; border: 1px solid var(--line); border-radius: var(--control-radius); background: transparent; color: var(--bad); font: 500 14px var(--sans); --icon-size: 16px; transition: background-color 140ms ease, border-color 140ms ease; }
.delete-button:hover:not(:disabled) { border-color: #fecaca; background: #fff1f0; }
@media (prefers-reduced-motion: reduce) { .delete-button { transition: none; } }
</style>
