<script setup lang="ts">
import { computed } from 'vue'
import { useAiEditor } from '../../composables/useAiEditor'
import { EXPLORE_SUGGESTIONS } from '../../composables/useWorkspaceUi'
import { blockTitle } from '../../workspace/labels'
import AppIcon from '../ui/AppIcon.vue'
import IconButton from '../ui/IconButton.vue'
import AiPlanCard from './AiPlanCard.vue'
import AiPatchPreview from './AiPatchPreview.vue'
import AiQuotes from './AiQuotes.vue'
import AiSettings from './AiSettings.vue'

const editor = useAiEditor()
const { store, ui } = editor

const context = computed(() => {
  const workspace = store.workspace.value
  const note = store.note.value
  const block = note?.blocks.find((item) => item.id === ui.selectedBlockId.value)
  return [
    { kind: 'Workspace', name: workspace?.metadata.name, empty: '未选择' },
    { kind: 'Note', name: note?.title, empty: '未选择' },
    { kind: 'Block', name: block ? blockTitle(block) : undefined, empty: '未选中' },
  ]
})

const streaming = computed(() => (
  editor.phase.value === 'planning'
  || editor.phase.value === 'patching'
  || (editor.busy.value && Boolean(editor.draftAnswer.value))
))
const phaseLabel = computed(() => {
  switch (editor.phase.value) {
    case 'planning': return '模型正在规划改动…'
    case 'patching': return '模型正在生成补丁…'
    case 'applying': return '正在写入笔记…'
    default: return ''
  }
})

function send(text?: string): void {
  if (text) ui.aiDraft.value = text
  void editor.send()
}
</script>

<template>
  <aside class="ai nexora-scroll" aria-label="AI 编辑">
    <header class="ai-head">
      <ol class="context-path" aria-label="聊天上下文">
        <li v-for="(part, index) in context" :key="part.kind" :class="{ empty: !part.name }" :title="`${part.kind}: ${part.name ?? part.empty}`">
          <span class="context-kind">{{ part.kind }}</span>
          <span class="context-name">{{ part.name ?? part.empty }}</span>
          <AppIcon v-if="index < context.length - 1" name="chevron" class="context-separator" />
        </li>
      </ol>
      <div class="head-actions">
        <label class="rewrite">
          <input v-model="editor.session.rewriteMode.value" type="checkbox" :disabled="editor.busy.value" />
          整篇重写
        </label>
        <IconButton icon="more" label="API 设置" tooltip-align="end" @click="editor.settingsOpen.value = !editor.settingsOpen.value" />
      </div>
    </header>

    <AiSettings v-if="editor.settingsOpen.value" />

    <div class="thread nexora-scroll">
      <article v-for="message in ui.aiMessages.value" :key="message.id" :class="['bubble', message.role]">
        <p>{{ message.content }}</p>
      </article>

      <article v-if="streaming || editor.reasoning.value" class="bubble thinking">
        <p class="kicker">{{ streaming ? phaseLabel : '思考过程' }}</p>
        <p class="reason">{{ editor.reasoning.value || '…' }}</p>
        <pre v-if="streaming && editor.draftAnswer.value" class="draft">{{ editor.draftAnswer.value }}</pre>
      </article>

      <p v-if="editor.error.value" class="error">{{ editor.error.value }}</p>

      <section
        v-if="editor.searchHits.value.length && (editor.phase.value === 'planned' || editor.phase.value === 'patching' || editor.phase.value === 'preview')"
        class="search-hits"
        aria-label="知乎搜索参考"
      >
        <p class="kicker">知乎搜索参考</p>
        <ul>
          <li v-for="hit in editor.searchHits.value.slice(0, 5)" :key="hit.contentId || hit.url">
            <a :href="hit.url" target="_blank" rel="noopener noreferrer">{{ hit.title || '无标题' }}</a>
            <span class="meta">{{ hit.contentType }} · 赞同 {{ hit.voteUpCount }}</span>
          </li>
        </ul>
      </section>

      <AiPlanCard v-if="editor.phase.value === 'planned' || editor.phase.value === 'patching'" />
      <AiPatchPreview v-if="editor.phase.value === 'preview' || editor.phase.value === 'applying'" />
    </div>

    <div v-if="editor.lastTask.value" class="undo-bar">
      <button type="button" :disabled="editor.busy.value" @click="editor.undoTask()">撤销这次改动</button>
    </div>

    <section v-if="!ui.aiMessages.value.length && editor.phase.value === 'idle'" class="suggested">
      <p class="kicker">Suggested</p>
      <button v-for="item in EXPLORE_SUGGESTIONS" :key="item.label" type="button" @click="send(item.text)">
        {{ item.label }}
      </button>
    </section>

    <form class="composer" @submit.prevent="send()">
      <AiQuotes />
      <label>
        <span class="sr">Ask anything</span>
        <textarea
          v-model="ui.aiDraft.value"
          rows="2"
          :placeholder="editor.canEdit.value ? '划选文字后点引用，然后告诉我要怎么改…' : '打开一篇笔记后再编辑'"
          :disabled="editor.busy.value"
          @keydown.enter.exact.prevent="send()"
        />
      </label>
      <div class="send-row">
        <button v-if="editor.busy.value" type="button" @click="editor.stop()">停止</button>
        <button type="submit" class="primary" :disabled="editor.busy.value || !editor.canEdit.value">Send</button>
      </div>
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
.error { margin: 0; color: #9f1239; font-size: 13px; }

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

.undo-bar button {
  width: 100%;
  height: 32px;
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
.send-row { display: flex; justify-content: flex-end; gap: 8px; }
.send-row button { height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; }
.primary { background: var(--accent); color: #fff; border-color: transparent !important; }

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
