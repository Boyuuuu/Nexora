<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import {
  describeSnapshot,
  exportBackupSnapshot,
  exportNoteSnapshot,
  exportWorkspaceSnapshot,
  importSnapshot,
  readSnapshotBlob,
  SNAPSHOT_VERSION,
  SnapshotError,
  snapshotFilename,
  snapshotToBlob,
  type ImportMode,
  type ImportSummary,
  type Snapshot,
  type SnapshotSummary,
} from '../data'
import { useKnowledgeStore } from '../stores/knowledgeStore'

const store = useKnowledgeStore()

const selectedWorkspaceId = ref('')
const selectedNoteId = ref('')
const busy = ref(false)
const notice = ref('')
const problem = ref('')

const picked = shallowRef<Snapshot | null>(null)
const pickedName = ref('')
const preview = ref<SnapshotSummary | null>(null)
const mode = ref<ImportMode>('copy')
const overwrite = ref(false)
const targetWorkspaceId = ref('')
const result = ref<ImportSummary | null>(null)

const needsTarget = computed(() => picked.value?.kind === 'note')

onMounted(async () => {
  await store.loadWorkspaces()
  const first = store.workspaces.value[0]
  if (first) selectedWorkspaceId.value = first.id
})

watch(selectedWorkspaceId, async (id) => {
  selectedNoteId.value = ''
  await store.selectWorkspace(id === '' ? null : id)
  const firstNote = store.notes.value[0]
  if (firstNote) selectedNoteId.value = firstNote.id
})

function describe(error: unknown): string {
  if (error instanceof SnapshotError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

async function withBusy(work: () => Promise<string>): Promise<void> {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  problem.value = ''
  try {
    notice.value = await work()
  } catch (error) {
    problem.value = describe(error)
  } finally {
    busy.value = false
  }
}

function download(snapshot: Snapshot): string {
  const url = URL.createObjectURL(snapshotToBlob(snapshot))
  const link = document.createElement('a')
  link.href = url
  link.download = snapshotFilename(snapshot)
  link.click()
  URL.revokeObjectURL(url)
  return link.download
}

function exportWorkspace() {
  return withBusy(async () => {
    if (selectedWorkspaceId.value === '') throw new Error('请先选择一个工作区')
    const snapshot = await exportWorkspaceSnapshot(selectedWorkspaceId.value)
    const counts = describeSnapshot(snapshot)
    return `已导出 ${download(snapshot)}（${counts.notes} 篇笔记 / ${counts.blocks} 个 Block / ${counts.nodes} 个节点 / ${counts.edges} 条边）`
  })
}

function exportNote() {
  return withBusy(async () => {
    if (selectedNoteId.value === '') throw new Error('请先选择一篇笔记')
    const snapshot = await exportNoteSnapshot(selectedNoteId.value)
    return `已导出 ${download(snapshot)}（${describeSnapshot(snapshot).blocks} 个 Block）`
  })
}

function exportBackup() {
  return withBusy(async () => {
    const snapshot = await exportBackupSnapshot()
    const counts = describeSnapshot(snapshot)
    if (counts.workspaces === 0) throw new Error('当前没有任何工作区可备份')
    return `已导出 ${download(snapshot)}（${counts.workspaces} 个工作区 / ${counts.notes} 篇笔记）`
  })
}

async function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  picked.value = null
  preview.value = null
  result.value = null
  if (!file) return

  await withBusy(async () => {
    const snapshot = await readSnapshotBlob(file)
    picked.value = snapshot
    pickedName.value = file.name
    preview.value = describeSnapshot(snapshot)
    if (snapshot.kind === 'note') {
      targetWorkspaceId.value = selectedWorkspaceId.value
    }
    return `已读取并校验 ${file.name}`
  })
}

function runImport() {
  return withBusy(async () => {
    const snapshot = picked.value
    if (!snapshot) throw new Error('请先选择一个快照文件')

    const summary = await importSnapshot(snapshot, {
      mode: mode.value,
      overwrite: overwrite.value,
      ...(needsTarget.value ? { workspaceId: targetWorkspaceId.value } : {}),
    })
    result.value = summary

    await store.loadWorkspaces()
    await store.reload()
    if (summary.workspaceIds[0]) {
      selectedWorkspaceId.value = summary.workspaceIds[0]
    }
    return `导入完成（${summary.mode === 'copy' ? '副本模式' : '恢复模式'}）`
  })
}
</script>

<template>
  <div class="lab">
    <header class="hero">
      <div>
        <p class="eyebrow">Nexora｜知域</p>
        <h1>备份 · 导出与导入</h1>
        <p class="sub">
          把知识库导出成一个自包含的 JSON 快照（资源以 base64 内联），随时重新载入。
          导入前会完整校验文件，写入在单个事务内完成——要么整份进库，要么什么都不改。
        </p>
      </div>
      <div class="hero-actions">
        <button class="primary" :disabled="busy" @click="exportBackup">导出全量备份</button>
        <p class="status">{{ problem || notice || '就绪' }}</p>
      </div>
    </header>

    <section class="panel">
      <div class="panel-head">
        <h2>导出</h2>
        <div class="btn-row">
          <button :disabled="busy || !selectedWorkspaceId" @click="exportWorkspace">
            导出该工作区
          </button>
          <button :disabled="busy || !selectedNoteId" @click="exportNote">导出该笔记</button>
        </div>
      </div>

      <div class="form-row">
        <label for="ws">工作区</label>
        <select id="ws" v-model="selectedWorkspaceId" :disabled="busy">
          <option value="">— 请选择 —</option>
          <option v-for="ws in store.workspaces.value" :key="ws.id" :value="ws.id">
            {{ ws.metadata.name }}（{{ ws.noteIds.length }} 篇 · {{ ws.graph.nodes.length }} 节点）
          </option>
        </select>
      </div>

      <div class="form-row">
        <label for="note">笔记</label>
        <select id="note" v-model="selectedNoteId" :disabled="busy || !store.notes.value.length">
          <option value="">— 请选择 —</option>
          <option v-for="item in store.notes.value" :key="item.id" :value="item.id">
            {{ item.title }}（{{ item.blocks.length }} 个 Block）
          </option>
        </select>
      </div>

      <p class="hint">
        单个工作区的快照包含它的全部笔记、Block、图节点与边、对话和资源；单篇笔记的快照只含这篇
        笔记本身，导入时需要指定接收它的工作区。
      </p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>导入</h2>
        <div class="btn-row">
          <button class="primary" :disabled="busy || !picked" @click="runImport">执行导入</button>
        </div>
      </div>

      <div class="form-row">
        <label for="file">快照文件</label>
        <input id="file" type="file" accept="application/json,.json" :disabled="busy" @change="pickFile" />
      </div>

      <template v-if="preview">
        <h3>文件内容（{{ pickedName }}）</h3>
        <div class="grid scores">
          <div class="chip"><span>类型</span><strong>{{ preview.kind }}</strong></div>
          <div class="chip"><span>工作区</span><strong>{{ preview.workspaces }}</strong></div>
          <div class="chip"><span>笔记</span><strong>{{ preview.notes }}</strong></div>
          <div class="chip"><span>Block</span><strong>{{ preview.blocks }}</strong></div>
          <div class="chip"><span>节点</span><strong>{{ preview.nodes }}</strong></div>
          <div class="chip"><span>边</span><strong>{{ preview.edges }}</strong></div>
          <div class="chip"><span>对话</span><strong>{{ preview.conversations }}</strong></div>
          <div class="chip"><span>资源</span><strong>{{ preview.assets }}</strong></div>
        </div>

        <div class="form-row">
          <label>导入模式</label>
          <div class="radio-row">
            <label><input v-model="mode" type="radio" value="copy" /> 导入为副本（重新生成全部 ID，与原数据共存）</label>
            <label><input v-model="mode" type="radio" value="restore" /> 恢复（保留文件中的原始 ID）</label>
          </div>
        </div>

        <div v-if="mode === 'restore'" class="form-row">
          <label>冲突处理</label>
          <label class="inline"
            ><input v-model="overwrite" type="checkbox" /> 目标已存在时覆盖（会先删除它现有的笔记、对话和资源）</label
          >
        </div>

        <div v-if="needsTarget" class="form-row">
          <label for="target">导入到</label>
          <select id="target" v-model="targetWorkspaceId" :disabled="busy">
            <option value="">— 请选择工作区 —</option>
            <option v-for="ws in store.workspaces.value" :key="ws.id" :value="ws.id">
              {{ ws.metadata.name }}
            </option>
          </select>
        </div>
      </template>

      <p v-else class="hint">选择一个 .json 快照，这里会显示它的内容概要，校验不通过会直接报错。</p>

      <ul v-if="result" class="checks">
        <li class="pass">
          <strong>导入成功 · {{ result.mode === 'copy' ? '副本' : '恢复' }}</strong>
          <span>
            工作区 {{ result.workspaceIds.join(', ') || '—' }} · 笔记 {{ result.noteIds.length }} ·
            Block {{ result.blocks }} · 节点 {{ result.nodes }} · 边 {{ result.edges }} · 对话
            {{ result.conversations }} · 资源 {{ result.assets }}
          </span>
        </li>
      </ul>
      <ul v-if="problem" class="checks">
        <li class="fail">
          <strong>失败</strong>
          <span>{{ problem }}</span>
        </li>
      </ul>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>格式说明</h2>
      </div>
      <pre class="structure">{{ `{
  "format": "nexora-snapshot",
  "version": ${SNAPSHOT_VERSION},
  "dbVersion": 1,
  "exportedAt": "2026-09-13T08:24:00.000Z",
  "kind": "workspace" | "backup" | "note",
  ...
}` }}</pre>
      <p class="hint">
        读取时会先看 <code>format</code> 和 <code>version</code>：版本高于当前实现会直接拒绝，
        而不是尝试导入半懂的文件。随后每条记录都过一遍数据层校验，并交叉检查文件内部的引用
        （笔记归属、workspace 的 ID 列表、边的两端、图节点指向的笔记）。
      </p>
    </section>
  </div>
</template>

<style scoped>
.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0.6rem 0;
}

.form-row > label:first-child {
  min-width: 5.5rem;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
}

.radio-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.radio-row label,
label.inline {
  font-size: 0.92rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

select,
input[type='file'] {
  font: inherit;
  font-size: 0.92rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  max-width: 30rem;
}

code {
  font-size: 0.85em;
  background: rgba(15, 118, 110, 0.08);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}
</style>
