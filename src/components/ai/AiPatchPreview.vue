<script setup lang="ts">
import { computed } from 'vue'
import { useAiEditor } from '../../composables/useAiEditor'
import { previewLabel } from '../../ai/protocol'
import { blockDiff } from '../../ai/editPreview'
import { blockTitle } from '../../workspace/labels'

const editor = useAiEditor()
const cards = computed(() => {
  const preview = editor.preview.value
  if (!preview) return []
  return preview.snapshots.map((change, index) => {
    const before = change.before
    const after = preview.afterNote.blocks.find((block) => block.id === change.blockId)
    const oldIndex = preview.note.blocks.findIndex((block) => block.id === change.blockId)
    const newIndex = preview.afterNote.blocks.findIndex((block) => block.id === change.blockId)
    const patch = preview.patches[index]!
    const anchor = patch.after_block_id ? preview.note.blocks.find((block) => block.id === patch.after_block_id) : undefined
    return {
      id: change.blockId, action: change.action, title: after ? blockTitle(after) : before ? blockTitle(before) : '知识块',
      location: before && after ? `第 ${oldIndex + 1} 块${oldIndex === newIndex ? '' : ` → 第 ${newIndex + 1} 块`}`
        : before ? `原第 ${oldIndex + 1} 块 · 将删除` : `新增为第 ${newIndex + 1} 块`,
      focusId: before?.id ?? anchor?.id,
      intent: patch.intent, fields: blockDiff(before, after), before, after,
    }
  })
})
const summary = computed(() => {
  const counts = new Map<string, number>()
  cards.value.forEach((card) => { const name = previewLabel(card.action); counts.set(name, (counts.get(name) ?? 0) + 1) })
  return [...counts].map(([label, count]) => `${label} ${count}`).join(' · ')
})
</script>

<template>
  <section v-if="editor.preview.value" class="preview" aria-label="笔记改动预览">
    <header>
      <strong>笔记改动预览</strong>
      <span class="note-name">{{ editor.preview.value.note.title }}</span>
      <small>{{ summary }} · 尚未保存</small>
    </header>
    <p v-if="editor.previewStale.value" class="stale" role="status">笔记已发生变化。这份预览已过期，请重新整理。</p>
    <p class="legend">红色标出原内容，绿色标出新内容；未变化的段落保持原色。</p>
    <details v-for="card in cards" :key="card.id" class="card" open>
      <summary>
        <span class="action" :class="card.action">{{ previewLabel(card.action) }}</span>
        <strong>{{ card.title }}</strong>
        <span class="location">{{ card.location }}</span>
      </summary>
      <div class="card-content">
        <div class="reason">
          <span>{{ card.intent || '根据这轮对话整理知识点。' }}</span>
          <button v-if="card.focusId" type="button" class="locate" @click="editor.focusPreview(card.focusId)">定位原文</button>
        </div>
        <div class="comparison">
          <section v-for="side in (['before', 'after'] as const)" :key="side" :class="['version', side]">
            <h4>{{ side === 'before' ? '原内容' : '修改后' }}</h4>
            <p v-if="!card[side]" class="empty">{{ side === 'before' ? '此处将新增一个知识块' : '此知识块将被删除' }}</p>
            <template v-else>
              <div v-for="field in card.fields.filter((field) => field[side].length)" :key="field.key" :class="['field', field.key]">
                <span class="field-label">{{ field.label }}</span>
                <div :class="{ monospace: field.key === 'code' || field.key === 'latex' }">
                  <span v-for="(line, lineIndex) in field[side]" :key="lineIndex" :class="['line', { changed: line.changed }]">{{ line.text || '\u00a0' }}</span>
                </div>
              </div>
            </template>
          </section>
        </div>
      </div>
    </details>

  </section>
</template>

<style scoped>
.preview { display: grid; gap: 10px; flex: none; min-width: 0; padding-top: 12px; border-top: 1px solid var(--line); }
header { display: grid; gap: 5px; }
header strong { font-size: 14px; color: var(--ink); }
.note-name { font-size: 13px; overflow-wrap: anywhere; }
small, .legend, .location, .reason, .empty { color: var(--muted); font-size: 12px; line-height: 1.6; }
.legend { margin: 0; }
.stale { margin: 0; padding: 10px; background: #fff6e6; color: #81540b; border-radius: var(--control-radius); font-size: 12px; line-height: 1.6; }
.card { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); overflow: hidden; }
summary { cursor: pointer; padding: 12px; font-size: 13px; overflow-wrap: anywhere; }
summary strong { font-weight: 600; }
.action { margin-right: 6px; font-size: 11px; color: var(--accent); }
.action.delete { color: #a13643; }
.location { display: block; margin-top: 4px; }
.card-content { padding: 0 12px 12px; }
.reason { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-bottom: 10px; }
.reason span { flex: 1 1 160px; }
.comparison { display: grid; gap: 10px; }
.version { border: 1px solid var(--line); border-radius: 8px; padding: 10px; min-width: 0; background: var(--paper, #fff); }
h4 { font-size: 11px; font-weight: 500; color: var(--muted); margin: 0 0 10px; }
.field + .field { margin-top: 10px; }
.field-label { display: block; color: var(--muted); font-size: 10px; margin-bottom: 3px; }
.line { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.75; border-radius: 3px; }
.title .line { font-weight: 600; font-size: 14px; }
.type .line, .language .line { font-size: 11px; }
.before .changed { background: #fcecef; color: #923342; }
.after .changed { background: #e5f4ed; color: #176144; }
.monospace .line { font-family: var(--mono); font-size: 12px; tab-size: 2; }
.empty { margin: 0; }
button { height: var(--control-size); border: 1px solid var(--line); border-radius: var(--control-radius); padding: 0 10px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; }
button.locate { padding: 0 6px; border-color: transparent; color: var(--accent); }
button:hover:not(:disabled) { background: var(--control-hover); }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.primary { background: var(--accent); color: #fff; border-color: transparent; }
.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
button:disabled { opacity: .5; cursor: default; }
</style>
