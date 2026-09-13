<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useKnowledgeTransfer, type TransferKind } from '../../composables/useKnowledgeTransfer'
import IconButton from '../ui/IconButton.vue'
import AppIcon from '../ui/AppIcon.vue'

const props = defineProps<{ kind: TransferKind | null }>()
const emit = defineEmits<{ close: [] }>()
const transfer = useKnowledgeTransfer()
const { store, scope, workspaceId, noteId, notes, loading, notesLoading, busy, locked,
  problem, notice, picked, filename, mode, overwrite, targetId, imported, preview,
  canExport, canImport } = transfer
const dialog = ref<HTMLDialogElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isExport = computed(() => props.kind === 'export')
const title = computed(() => isExport.value ? '备份导出' : '从外部导入')
const summary = computed(() => {
  const counts = preview.value
  if (!counts) return ''
  return [
    counts.workspaces ? `${counts.workspaces} 个 Workspace` : '', `${counts.notes} 篇笔记`,
    `${counts.blocks} 个 Block`, counts.nodes ? `${counts.nodes} 个节点` : '',
    counts.edges ? `${counts.edges} 条连接` : '', counts.conversations ? `${counts.conversations} 个对话` : '',
    counts.assets ? `${counts.assets} 个附件` : '',
  ].filter(Boolean).join(' · ')
})

watch(() => props.kind, async (kind) => {
  if (!kind) { dialog.value?.close(); transfer.dispose(); return }
  await nextTick()
  if (!props.kind || !dialog.value) return
  if (!dialog.value.open) dialog.value.showModal()
  if (fileInput.value) fileInput.value.value = ''
  await transfer.initialize()
  if (props.kind) dialog.value?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => { transfer.dispose(); dialog.value?.close() })
function close() { if (!busy.value) emit('close') }
function backdrop(event: MouseEvent) {
  const element = dialog.value
  if (!element || event.target !== element) return
  const rect = element.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter((item) => item.getClientRects().length > 0)
  const first = controls[0], last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
async function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await transfer.selectFile(file)
  input.value = ''
}
async function submit() {
  if (isExport.value) await transfer.exportFile()
  else if (imported.value) close()
  else await transfer.importFile()
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" id="workspace-transfer-dialog" class="transfer-dialog" aria-labelledby="transfer-title" @cancel.prevent="close" @click="backdrop" @keydown="trapFocus">
      <header class="dialog-head">
        <h2 id="transfer-title">{{ title }}</h2>
        <IconButton icon="close" :label="`关闭${title}`" tooltip-align="end" :disabled="busy" @click="close" />
      </header>
      <form class="transfer-form" @submit.prevent="submit">
        <div class="dialog-body nexora-scroll" :aria-busy="locked">
          <template v-if="isExport">
            <label class="field">
              <span>导出范围</span>
              <select v-model="scope" data-initial-focus :disabled="locked" @change="notice = ''; problem = ''">
                <option value="workspace">单个 Workspace</option>
                <option value="note">单篇笔记</option>
                <option value="all">全部 Workspace</option>
              </select>
            </label>
            <label v-if="scope !== 'all'" class="field">
              <span>Workspace</span>
              <select :value="workspaceId" :disabled="locked || !store.workspaces.value.length" @change="transfer.selectWorkspace(($event.target as HTMLSelectElement).value)">
                <option v-if="!store.workspaces.value.length" value="">暂无 Workspace</option>
                <option v-for="item in store.workspaces.value" :key="item.id" :value="item.id">{{ item.metadata.name }}</option>
              </select>
            </label>
            <label v-if="scope === 'note'" class="field">
              <span>笔记</span>
              <select v-model="noteId" :disabled="locked || notesLoading || !notes.length" @change="notice = ''">
                <option v-if="!notes.length" value="">{{ notesLoading ? '正在加载…' : '这个 Workspace 暂无笔记' }}</option>
                <option v-for="item in notes" :key="item.id" :value="item.id">{{ item.title }}</option>
              </select>
            </label>
            <p class="hint">{{ !store.workspaces.value.length && !loading ? '创建或导入 Workspace 后，就可以在这里导出。' : scope === 'note' ? '包含所选笔记及其中的全部 Block。' : scope === 'all' ? `备份全部 ${store.workspaces.value.length} 个 Workspace，包含笔记、画布、对话和附件。` : '包含这个 Workspace 的全部笔记、画布、对话和附件。' }}</p>
          </template>

          <template v-else>
            <input ref="fileInput" class="file-input" type="file" accept="application/json,.json" tabindex="-1" aria-label="选择备份文件" :disabled="locked" @change="pickFile" />
            <button type="button" class="file-picker" :class="{ selected: picked }" data-initial-focus :disabled="locked" @click="fileInput?.click()">
              <AppIcon name="upload" />
              <span class="file-text"><strong>{{ filename || '选择备份文件' }}</strong><small>{{ filename ? '点击重新选择文件' : '支持 Nexora 导出的 .json 文件' }}</small></span>
            </button>
            <template v-if="picked && preview">
              <p class="file-summary">{{ summary }}</p>
              <label v-if="picked.kind === 'note'" class="field">
                <span>导入到 Workspace</span>
                <select v-model="targetId" :disabled="locked || !!imported">
                  <option value="">请选择 Workspace</option>
                  <option v-for="item in store.workspaces.value" :key="item.id" :value="item.id">{{ item.metadata.name }}</option>
                </select>
              </label>
              <p v-if="picked.kind === 'note' && !store.workspaces.value.length" class="hint">请先新建 Workspace，再导入这篇笔记。</p>
              <label class="field">
                <span>导入方式</span>
                <select v-model="mode" :disabled="locked || !!imported" @change="overwrite = false; problem = ''">
                  <option value="copy">导入为副本</option>
                  <option value="restore">恢复备份</option>
                </select>
              </label>
              <p class="hint">{{ mode === 'copy' ? '创建独立副本，保留现有内容。' : '按备份恢复内容；数据已存在时，需要允许替换。' }}</p>
              <template v-if="mode === 'restore'">
                <label class="overwrite"><input v-model="overwrite" type="checkbox" :disabled="locked || !!imported" @change="problem = ''" />允许替换已有内容</label>
                <p v-if="overwrite" class="warning">{{ picked.kind === 'note' ? '已有的这篇笔记将被替换，当前修改会丢失。' : '备份对应的 Workspace 及其内容将被替换，当前修改会丢失。' }}</p>
              </template>
            </template>
          </template>
          <p v-if="loading || busy" class="hint" role="status">{{ loading ? '正在加载…' : isExport ? '正在准备导出文件…' : '正在处理文件…' }}</p>
          <p v-if="problem" class="error" role="alert">{{ problem }}</p>
          <p v-if="notice" class="success" role="status">{{ notice }}</p>
        </div>
        <footer class="dialog-footer">
          <span>{{ isExport ? 'JSON 文件' : '文件仅在本地处理' }}</span>
          <button type="submit" class="primary" :disabled="isExport ? !canExport : imported ? locked : !canImport">{{ isExport ? '导出文件' : imported ? '完成' : '导入' }}</button>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.transfer-dialog { width: min(500px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); color: var(--ink); box-shadow: 0 24px 80px rgba(28, 25, 23, 0.18); }
.transfer-dialog[open] { display: flex; flex-direction: column; animation: transfer-enter var(--panel-duration) var(--panel-easing); }
.transfer-dialog::backdrop { background: rgba(28, 25, 23, 0.3); }
.dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px 12px; flex: none; }
.dialog-head h2 { margin: 0; font: 600 18px/1.4 var(--sans); }
.transfer-form { display: flex; flex-direction: column; min-height: 0; }
.dialog-body { display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 4px 24px 24px; }
.field { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 13px; font-weight: 500; }
select { width: 100%; min-width: 0; height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--panel); color: var(--ink); font: 14px/1.5 var(--sans); text-overflow: ellipsis; }
select:focus-visible, .file-picker:focus-visible, .overwrite input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hint, .error, .success, .warning, .file-summary { margin: 0; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.hint, .file-summary { color: var(--muted); }
.error, .warning { color: var(--bad); }
.success { color: var(--accent); }
.dialog-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; border-top: 1px solid var(--line); padding: 16px 24px; }
.dialog-footer span { color: var(--muted); font-size: 12px; }
.dialog-footer button { height: var(--control-size); padding: 0 16px; border-radius: var(--control-radius); font: 500 14px/1 var(--sans); }
.file-input { display: none; }
.file-picker { display: flex; align-items: center; gap: 14px; width: 100%; padding: 24px 16px; border: 1px dashed var(--line); border-radius: 12px; background: transparent; text-align: left; }
.file-picker:hover:not(:disabled) { background: var(--control-hover); border-color: var(--muted); }
.file-picker .app-icon { --icon-size: 24px; color: var(--muted); }
.file-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.file-text strong { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-text small { font-size: 12px; color: var(--muted); }
.overwrite { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.overwrite input { margin: 0; accent-color: var(--accent); }
@keyframes transfer-enter { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
