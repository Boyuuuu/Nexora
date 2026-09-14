<script setup lang="ts">
import { useAiEditor } from '../../composables/useAiEditor'
import { previewLabel } from '../../ai/protocol'
import { BLOCK_TYPE_LABELS, blockBody, blockTitle } from '../../workspace/labels'

const editor = useAiEditor()

function beforeText(blockId?: string): string {
  if (!blockId) return ''
  const block = editor.store.blocks.value.find((item) => item.id === blockId)
  return block ? `${blockTitle(block)}\n${blockBody(block)}` : ''
}

function afterText(data: Record<string, unknown> | undefined): string {
  if (!data) return ''
  if (typeof data.latex === 'string') return `${data.title ?? ''}\n${data.latex}\n${data.explanation ?? ''}`.trim()
  if (typeof data.code === 'string') return `${data.title ?? ''}\n${data.code}`.trim()
  if (Array.isArray(data.items)) return `${data.title ?? ''}\n${data.items.join('\n')}`.trim()
  return `${typeof data.title === 'string' ? data.title : ''}\n${typeof data.content === 'string' ? data.content : ''}`.trim()
}
</script>

<template>
  <section v-if="editor.patches.value.length" class="preview" aria-label="改动预览">
    <header>
      <strong>对照预览</strong>
      <span>应用前不会写入笔记</span>
    </header>
    <article v-for="(patch, index) in editor.patches.value" :key="`${patch.action}-${patch.block_id ?? index}`" class="card">
      <div class="meta">
        <span>{{ previewLabel(patch.action) }}</span>
        <span v-if="patch.type">{{ BLOCK_TYPE_LABELS[patch.type] }}</span>
      </div>
      <div class="diff">
        <pre v-if="patch.action !== 'create'" class="old">{{ beforeText(patch.block_id) || '（原内容）' }}</pre>
        <pre v-if="patch.action !== 'delete'" class="new">{{ afterText(patch.data as Record<string, unknown> | undefined) || patch.intent || '（新内容）' }}</pre>
      </div>
    </article>
    <div class="actions">
      <button type="button" class="primary" :disabled="editor.busy.value" @click="editor.apply()">应用改动</button>
      <button type="button" :disabled="editor.busy.value" @click="editor.discardPreview()">先不应用</button>
    </div>
  </section>
</template>

<style scoped>
.preview { display: grid; gap: 8px; }
header { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 8px; background: #fff; }
.meta { display: flex; gap: 8px; color: var(--accent); font-size: 11px; font-weight: 700; }
.diff { display: grid; gap: 6px; margin-top: 6px; }
pre { margin: 0; padding: 8px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; font: 12px/1.5 var(--sans); max-height: 160px; overflow: auto; }
.old { background: #f5ebe6; color: #9f1239; }
.new { background: #ecfdf5; color: #166534; }
.actions { display: flex; gap: 8px; }
button { height: 32px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: transparent; }
.primary { background: var(--accent); color: #fff; border-color: transparent; }
</style>
