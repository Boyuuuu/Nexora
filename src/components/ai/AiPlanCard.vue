<script setup lang="ts">
import { useAiEditor } from '../../composables/useAiEditor'
import { previewLabel } from '../../ai/protocol'
import { BLOCK_TYPE_LABELS, blockTitle } from '../../workspace/labels'

const editor = useAiEditor()
</script>

<template>
  <section v-if="editor.plan.value" class="plan" aria-label="改动计划">
    <header>
      <strong>{{ editor.plan.value.mode === 'rewrite' ? '整篇重写' : '编辑计划' }}</strong>
      <span>{{ editor.selectedCount.value }}/{{ editor.plan.value.targets.length }} 已选</span>
    </header>
    <p class="summary">{{ editor.plan.value.summary }}</p>
    <ul>
      <li v-for="target in editor.plan.value.targets" :key="target.key">
        <label>
          <input v-model="target.selected" type="checkbox" :disabled="editor.busy.value" />
          <span class="action">{{ previewLabel(target.action) }}</span>
          <span class="name">
            {{ target.block_id
              ? (editor.store.blocks.value.find((block) => block.id === target.block_id)
                ? blockTitle(editor.store.blocks.value.find((block) => block.id === target.block_id)!)
                : target.block_id)
              : `新 ${target.type ? BLOCK_TYPE_LABELS[target.type] : '块'}` }}
          </span>
        </label>
        <small>{{ target.intent }}</small>
      </li>
    </ul>
    <div class="actions">
      <button type="button" class="primary" :disabled="editor.busy.value || !editor.selectedCount.value" @click="editor.generatePatches()">
        生成改动
      </button>
      <button type="button" :disabled="editor.busy.value" @click="editor.discardPlan()">放弃</button>
    </div>
  </section>
</template>

<style scoped>
.plan { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
header { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); }
.summary { margin: 0; font-size: 13px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
li { min-width: 0; }
label { display: flex; align-items: center; gap: 6px; min-width: 0; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.action { flex: none; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
small { display: block; margin: 2px 0 0 22px; color: var(--muted); font-size: 12px; }
.actions { display: flex; gap: 8px; }
button { height: 32px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: transparent; }
.primary { background: var(--accent); color: #fff; border-color: transparent; }
</style>
