<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAiEditor } from '../../composables/useAiEditor'
import { blockTitle } from '../../workspace/labels'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import AiQuotes from './AiQuotes.vue'
import AiSettings from './AiSettings.vue'
import ChatContent from './ChatContent.vue'
import AiPatchPreview from './AiPatchPreview.vue'
const editor = useAiEditor()
const { store, ui } = editor
const thread = ref<HTMLElement | null>(null)
const followBottom = ref(true)
const context = computed(() => {
  const block = store.blocks.value.find((item) => item.id === ui.selectedBlockId.value)
  return [
    { kind: 'Workspace', name: store.workspace.value?.metadata.name, empty: '未选择' },
    { kind: 'Note', name: store.note.value?.title, empty: '未选择' },
    { kind: 'Block', name: block ? blockTitle(block) : undefined, empty: '未选中' },
  ]
})
const phaseLabel = computed(() => {
  if (!editor.currentBusy.value) return ''
  return { idle: '', chatting: '正在回答…', organizing: '正在整理笔记…', applying: '正在保存…' }[editor.phase.value]
})
watch(() => store.note.value?.id, async () => {
  followBottom.value = true
  editor.session.clearQuotes()
  try { await editor.loadConversation() } catch { ui.showToast('聊天记录读取失败，请重新打开笔记。') }
}, { immediate: true })
watch([editor.messages, editor.draftAnswer, editor.notice, editor.error], async () => {
  await nextTick()
  if (followBottom.value && thread.value && !editor.preview.value) thread.value.scrollTop = thread.value.scrollHeight
}, { deep: true })
watch(editor.preview, async (preview) => {
  if (!preview) return
  await nextTick()
  const container = thread.value
  const panel = container?.querySelector<HTMLElement>('[aria-label="笔记改动预览"]')
  if (container && panel) container.scrollTop += panel.getBoundingClientRect().top - container.getBoundingClientRect().top
})
function onScroll(): void {
  const el = thread.value
  if (el) followBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function send(event?: KeyboardEvent): void {
  if (event?.isComposing) return
  event?.preventDefault()
  followBottom.value = true
  void editor.send()
}
</script>

<template>
  <aside class="ai nexora-scroll" aria-label="AI 聊天">
    <header class="ai-head">
      <ol class="context-path" aria-label="聊天上下文">
        <li v-for="(part, index) in context" :key="part.kind" :class="{ empty: !part.name }" :title="`${part.kind}: ${part.name ?? part.empty}`">
          <span class="context-kind">{{ part.kind }}</span><span class="context-name">{{ part.name ?? part.empty }}</span>
          <AppIcon v-if="index < context.length - 1" name="chevron" class="context-separator" />
        </li>
      </ol>
      <div class="head-actions">
        <label class="rewrite"><input v-model="editor.autoOrganize.value" type="checkbox" :disabled="editor.busy.value" />回答后生成笔记预览</label>
        <IconButton icon="more" label="模型设置" tooltip-align="end" @click="editor.settingsOpen.value = true" />
      </div>
    </header>
    <AiSettings v-if="editor.settingsOpen.value" />
    <div ref="thread" class="thread nexora-scroll" @scroll="onScroll">
      <div v-if="!editor.messages.value.length" class="empty-chat">
        <AppIcon name="chat" /><p>从一个问题开始</p><span>回答后会生成带标题的笔记建议。先预览变化，再决定是否保存。</span>
      </div>
      <article v-for="message in editor.messages.value" :key="message.id" :class="['bubble', message.role]">
        <ChatContent v-if="message.role === 'assistant'" :content="message.content" /><p v-else>{{ message.content }}</p>
      </article>
      <details v-if="editor.reasoning.value" class="reasoning"><summary>思考过程</summary><p>{{ editor.reasoning.value }}</p></details>
      <article v-if="editor.draftAnswer.value" class="bubble assistant"><ChatContent :content="editor.draftAnswer.value" /></article>
      <p v-if="phaseLabel" class="status" role="status">{{ phaseLabel }}</p>
      <p v-if="editor.notice.value" class="status" role="status">{{ editor.notice.value }}</p>
      <AiPatchPreview v-if="editor.preview.value" />
      <button v-else-if="editor.canRetry.value" class="retry-organize" type="button" :disabled="editor.busy.value" @click="editor.retryOrganization()">重新整理这轮回答</button>
    </div>
    <p v-if="editor.error.value" class="error" role="alert">{{ editor.error.value }}</p>
    <div v-if="editor.lastTask.value" class="undo-bar"><button type="button" :disabled="editor.busy.value" @click="editor.undoTask()">撤销这次整理</button></div>
    <form class="composer" @submit.prevent="send()">
      <template v-if="editor.preview.value">
        <p class="status">确认后保存到当前 Note，也可以重新整理或放弃。</p>
        <div class="send-row review-actions">
          <button type="button" class="primary" :disabled="editor.busy.value || editor.previewStale.value" @click="editor.apply()">应用 {{ editor.patches.value.length }} 项改动</button>
          <button type="button" :disabled="editor.busy.value" @click="editor.retryOrganization()">重新整理</button>
          <button type="button" :disabled="editor.busy.value" @click="editor.discardPreview()">放弃</button>
          <button v-if="editor.currentBusy.value && editor.phase.value === 'organizing'" type="button" @click="editor.stop()">停止</button>
        </div>
      </template>
      <template v-else>
      <AiQuotes />
      <label><span class="sr">发送消息</span><textarea v-model="ui.aiDraft.value" rows="3" :placeholder="editor.canEdit.value ? '询问、讨论，或告诉我如何修改笔记…' : '打开一篇笔记后开始对话'" :disabled="editor.busy.value" @keydown.enter.exact="send($event)" /></label>
      <div class="send-row"><span class="mode-label">{{ editor.settings.value.mode === 'single' ? '单模型' : '双模型' }}</span><button v-if="editor.busy.value" type="button" :disabled="editor.phase.value === 'applying'" @click="editor.stop()">停止</button><button type="submit" class="primary" :disabled="editor.busy.value || Boolean(editor.preview.value) || !editor.canEdit.value || !ui.aiDraft.value.trim()">发送</button></div>
      </template>
    </form>
  </aside>
</template>

<style scoped>
.ai {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem 0.85rem 1rem;
  background: var(--panel);
  border-left: 1px solid var(--line);
}

.ai-head { display: grid; gap: 8px; }
.head-actions { display: flex; justify-content: space-between; align-items: center; }
.rewrite { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }

.context-path { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; flex: none; list-style: none; padding: 0 0 12px; margin: 0; border-bottom: 1px solid var(--line); }
.context-path li { position: relative; min-width: 0; }
.context-kind { display: block; color: var(--muted); font-size: 11px; line-height: 1.4; }
.context-name { display: block; margin-top: 4px; color: var(--ink); font-size: 13px; font-weight: 500; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty .context-name { color: var(--muted); font-weight: 400; }
.context-separator { --icon-size: 10px; position: absolute; right: -14px; top: 24px; color: var(--muted); }

.kicker {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}

.suggested {
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.thread {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.bubble {
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  background: #fff;
  border: 1px solid var(--line);
}

.bubble p { margin: 0; white-space: pre-wrap; }
.bubble.user { background: rgba(15, 118, 110, 0.08); border-color: transparent; }
.thinking { background: #fbf8f2; }
.reason { margin-top: 6px; color: var(--muted); font-size: 13px; }
.draft { margin: 8px 0 0; white-space: pre-wrap; font: 12px/1.45 var(--mono); color: var(--ink); max-height: 180px; overflow: auto; }
.error { flex: none; margin: 0; padding: 8px 10px; border-radius: var(--control-radius); background: #fcecef; color: #9f1239; font-size: 13px; line-height: 1.6; max-height: 140px; overflow: auto; }

.search-hits {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  padding: 0.65rem 0.75rem;
}
.search-hits ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 8px; }
.search-hits a { color: var(--ink); font-size: 13px; font-weight: 500; text-decoration: none; }
.search-hits a:hover { text-decoration: underline; }
.search-hits .meta { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }

.suggested button {
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.28rem 0;
  color: var(--ink);
}

.retry-organize { flex: none; align-self: flex-start; padding: 0 12px; border: 1px solid var(--line); background: transparent; border-radius: var(--control-radius); height: var(--control-size); }
.undo-bar button {
  width: 100%;
  height: var(--control-size);
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
}

.composer { display: flex; flex-direction: column; gap: 0.45rem; }
.composer textarea {
  width: 100%;
  resize: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  font: inherit;
}
.review-actions { justify-content: flex-start !important; flex-wrap: wrap; }
.send-row { display: flex; justify-content: flex-end; gap: 8px; }
.send-row button { height: var(--control-size); padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; }
.send-row .primary { background: var(--accent); color: #fff; border-color: transparent !important; }

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.mode-label { margin-right: auto; align-self: center; color: var(--muted); font-size: 12px; }
.status { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.empty-chat { margin: auto; text-align: center; padding: 24px 10px; color: var(--muted); }
.empty-chat p { color: var(--ink); font-size: 16px; }
.empty-chat span { font-size: 12px; line-height: 1.8; }
.bubble { overflow-wrap: anywhere; flex: none; }
.bubble.assistant { border: 0; background: transparent; padding-left: 0; padding-right: 0; }
.reasoning { color: var(--muted); font-size: 12px; }
.reasoning summary { cursor: pointer; }
.reasoning p { white-space: pre-wrap; line-height: 1.6; }
.send-row button, .retry-organize { flex: none; align-self: flex-start; padding: 0 12px; border: 1px solid var(--line); background: transparent; border-radius: var(--control-radius); height: var(--control-size); }
.undo-bar button { border-radius: var(--control-radius); }
.send-row button:disabled { opacity: .5; cursor: default; }
.send-row button:hover:not(:disabled), .undo-bar button:hover:not(:disabled) { background: var(--control-hover); color: var(--ink); }
.rewrite input { accent-color: var(--accent); }
</style>
