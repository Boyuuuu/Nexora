<script setup lang="ts">
import { computed } from 'vue'
import { useAiEditor } from '../../composables/useAiEditor'
import { ZHIDA_MODELS, ZHIDA_MODEL_LABELS, type ZhidaModel } from '../../ai/settings'
import type { StructuredResponseFormat } from '../../ai/providerSettings'

const editor = useAiEditor()
const settings = editor.settings

const structured = computed(() => settings.value.structured)
const zhida = computed(() => settings.value.zhida)

function patchStructured(partial: Partial<typeof settings.value.structured>): void {
  editor.persistSettings({
    ...settings.value,
    structured: { ...settings.value.structured, ...partial },
  })
}

function patchZhida(partial: Partial<typeof settings.value.zhida>): void {
  editor.persistSettings({
    ...settings.value,
    zhida: { ...settings.value.zhida, ...partial },
  })
}
</script>

<template>
  <section class="settings" aria-label="模型设置">
    <h3>结构化模型（Plan / Patch）</h3>
    <p class="hint">
      用于灵活决策并强制合法 JSON。需要 OpenAI 兼容接口，优先支持
      <code>response_format.json_schema</code>。
    </p>
    <label>
      <span>API Key</span>
      <input
        :value="structured.apiKey"
        type="password"
        autocomplete="off"
        spellcheck="false"
        @input="patchStructured({ apiKey: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label>
      <span>模型 ID</span>
      <input
        :value="structured.model"
        type="text"
        spellcheck="false"
        placeholder="gpt-4o-mini"
        @input="patchStructured({ model: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label>
      <span>接口地址</span>
      <input
        :value="structured.baseUrl"
        type="text"
        spellcheck="false"
        placeholder="/openai"
        @input="patchStructured({ baseUrl: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label>
      <span>强制格式</span>
      <select
        :value="structured.responseFormat"
        @change="patchStructured({ responseFormat: ($event.target as HTMLSelectElement).value as StructuredResponseFormat })"
      >
        <option value="json_schema">json_schema（推荐）</option>
        <option value="json_object">json_object（兼容更多供应商）</option>
      </select>
    </label>
    <p class="hint">
      开发环境默认走本地代理 <code>/openai</code> →
      <code>VITE_OPENAI_PROXY_TARGET</code>（默认 api.openai.com）。也可用
      <code>VITE_STRUCTURED_API_KEY</code> 预填密钥。
    </p>

    <h3>知乎（搜索 + 直答）</h3>
    <p class="hint">同一 Access Secret。编辑时可用站内搜索为 Plan/Patch 提供参考摘录。</p>
    <label>
      <span>Access Secret</span>
      <input
        :value="zhida.accessSecret"
        type="password"
        autocomplete="off"
        spellcheck="false"
        @input="patchZhida({ accessSecret: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="zhida.useSearch !== false"
        @change="patchZhida({ useSearch: ($event.target as HTMLInputElement).checked })"
      />
      <span>编辑时启用知乎站内搜索</span>
    </label>
    <label>
      <span>直答模型（可选）</span>
      <select
        :value="zhida.model"
        @change="patchZhida({ model: ($event.target as HTMLSelectElement).value as ZhidaModel })"
      >
        <option v-for="model in ZHIDA_MODELS" :key="model" :value="model">{{ ZHIDA_MODEL_LABELS[model] }}</option>
      </select>
    </label>
    <label>
      <span>接口地址</span>
      <input
        :value="zhida.baseUrl"
        type="text"
        spellcheck="false"
        @input="patchZhida({ baseUrl: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <p class="hint">搜索走 <code>/api/v1/content/zhihu_search</code>（开发环境经 <code>/zhida</code> 代理）。</p>
  </section>
</template>

<style scoped>
.settings { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
h3 { margin: 6px 0 0; font: 600 13px/1.3 var(--sans); color: var(--ink); }
h3:first-child { margin-top: 0; }
label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
label.check { display: flex; align-items: center; gap: 8px; height: 34px; }
label.check input { width: 14px; height: 14px; }
input, select { height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 0 8px; font: 13px/1.4 var(--sans); background: var(--panel); color: var(--ink); }
.hint { margin: 0; color: var(--muted); font-size: 12px; }
code { font-family: var(--mono); font-size: 11px; }
</style>
