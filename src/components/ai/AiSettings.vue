<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAiEditor } from '../../composables/useAiEditor'
import { ZHIDA_MODELS, ZHIDA_MODEL_LABELS, type ZhidaModel } from '../../ai/settings'
import type { AiMode, StructuredResponseFormat } from '../../ai/providerSettings'
import IconButton from '../ui/IconButton.vue'

const editor = useAiEditor()
const settings = editor.settings
const structured = computed(() => settings.value.structured)
const zhida = computed(() => settings.value.zhida)
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
function close(): void { editor.settingsOpen.value = false }
function setMode(mode: AiMode): void { editor.persistSettings({ ...settings.value, mode }) }
function patchStructured(partial: Partial<typeof settings.value.structured>): void {
  editor.persistSettings({ ...settings.value, structured: { ...settings.value.structured, ...partial } })
}
function patchZhida(partial: Partial<typeof settings.value.zhida>): void {
  editor.persistSettings({ ...settings.value, zhida: { ...settings.value.zhida, ...partial } })
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); close() }
  if (event.key !== 'Tab') return
  const items = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex="0"]') ?? []).filter((item) => item.getClientRects().length)
  const first = items[0], last = items.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => { previousFocus = document.activeElement as HTMLElement; dialog.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus() })
onBeforeUnmount(() => previousFocus?.focus())
</script>

<template>
  <Teleport to="body">
    <div class="settings-backdrop" @click.self="close" @keydown="onKey">
      <section ref="dialog" class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <header><h2 id="ai-settings-title">模型设置</h2><IconButton icon="close" label="关闭模型设置" @click="close" /></header>
        <div class="settings-body nexora-scroll">
          <div class="mode-switch" role="group" aria-label="模型模式">
            <button type="button" :aria-pressed="settings.mode === 'single'" @click="setMode('single')">单模型</button>
            <button type="button" :aria-pressed="settings.mode === 'dual'" @click="setMode('dual')">双模型</button>
          </div>
          <p class="hint">{{ settings.mode === 'single' ? '知乎负责聊天和笔记整理。整理后先预览，确认后保存。格式异常时可重试，不会复制回答原文。' : '知乎负责聊天，第二个模型负责整理笔记。' }}</p>
          <fieldset>
            <legend>知乎模型</legend>
            <label><span>Access Secret</span><input :value="zhida.accessSecret" type="password" autocomplete="off" spellcheck="false" placeholder="填写知乎开放平台凭证" @input="patchZhida({ accessSecret: ($event.target as HTMLInputElement).value })" /></label>
            <label><span>模型</span><select :value="zhida.model" @change="patchZhida({ model: ($event.target as HTMLSelectElement).value as ZhidaModel })"><option v-for="model in ZHIDA_MODELS" :key="model" :value="model">{{ ZHIDA_MODEL_LABELS[model] }}</option></select></label>
            <label class="check"><input type="checkbox" :checked="zhida.useSearch" @change="patchZhida({ useSearch: ($event.target as HTMLInputElement).checked })" /><span>回答时参考知乎搜索</span></label>
            <details><summary>连接设置</summary><label><span>知乎接口地址</span><input :value="zhida.baseUrl" type="text" spellcheck="false" @input="patchZhida({ baseUrl: ($event.target as HTMLInputElement).value })" /></label></details>
          </fieldset>
          <fieldset v-if="settings.mode === 'dual'">
            <legend>整理模型</legend>
            <label><span>API Key</span><input :value="structured.apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="填写整理模型的密钥" @input="patchStructured({ apiKey: ($event.target as HTMLInputElement).value })" /></label>
            <label><span>模型 ID</span><input :value="structured.model" type="text" spellcheck="false" placeholder="例如 deepseek-chat" @input="patchStructured({ model: ($event.target as HTMLInputElement).value })" /></label>
            <label><span>接口地址</span><input :value="structured.baseUrl" type="text" spellcheck="false" placeholder="填写服务商地址或代理地址" @input="patchStructured({ baseUrl: ($event.target as HTMLInputElement).value })" /></label>
            <details><summary>格式设置</summary><label><span>输出格式</span><select :value="structured.responseFormat" @change="patchStructured({ responseFormat: ($event.target as HTMLSelectElement).value as StructuredResponseFormat })"><option value="json_schema">JSON Schema</option><option value="json_object">JSON Object</option></select></label><p class="hint">按服务商支持的格式选择，使用兼容 Chat Completions 的接口。</p></details>
          </fieldset>
        </div>
        <footer><span class="hint">自动保存到此浏览器，下次发送时生效</span><button type="button" class="done" @click="close">完成</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgb(20 30 28 / 30%); display: grid; place-items: center; padding: 20px; }
.settings-dialog { width: min(460px, 100%); max-height: min(780px, calc(100dvh - 40px)); display: flex; flex-direction: column; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 20px 70px rgb(0 0 0 / 18%); }
header, footer { display: flex; align-items: center; justify-content: space-between; flex: none; padding: 16px 22px; gap: 12px; }
h2 { margin: 0; font: 600 18px/1.4 var(--sans); }
.settings-body { display: grid; gap: 14px; padding: 0 22px 20px; overflow: auto; min-height: 0; }
.mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: var(--control-hover); border-radius: 10px; padding: 4px; }
.mode-switch button { height: var(--control-size); border: 0; border-radius: var(--control-radius); background: transparent; color: var(--muted); font: 500 14px var(--sans); }
.mode-switch button[aria-pressed="true"] { background: var(--panel); color: var(--ink); box-shadow: 0 1px 4px rgb(0 0 0 / 8%); }
button:hover { background: var(--control-hover); }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
fieldset { display: grid; gap: 12px; margin: 0; padding: 14px 0 0; border: 0; border-top: 1px solid var(--line); min-width: 0; }
legend { padding: 0 8px 0 0; font-size: 13px; font-weight: 600; }
label { display: grid; gap: 6px; color: var(--muted); font-size: 12px; }
input, select { min-width: 0; width: 100%; height: var(--control-size); border: 1px solid var(--line); border-radius: var(--control-radius); padding: 0 10px; font: 13px var(--sans); background: var(--panel); color: var(--ink); }
.check { display: flex; align-items: center; gap: 8px; }
.check input { width: 15px; height: 15px; accent-color: var(--accent); }
summary { cursor: pointer; color: var(--muted); font-size: 12px; padding: 6px 0; }
details label { margin-top: 8px; }
.hint { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
footer { border-top: 1px solid var(--line); }
.done { height: var(--control-size); flex: none; padding: 0 18px; border: 0; border-radius: var(--control-radius); background: var(--accent); color: #fff; }
.done:hover { filter: brightness(.95); background: var(--accent); }
</style>
