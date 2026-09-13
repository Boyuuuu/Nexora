<script setup lang="ts">
import { computed } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const props = defineProps<{
  latex: string
  display?: boolean
}>()

function normalize(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 1) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

const rendered = computed(() => {
  const source = normalize(props.latex)
  if (!source) {
    return { ok: false as const, html: '', fallback: '' }
  }
  try {
    return {
      ok: true as const,
      html: katex.renderToString(source, {
        displayMode: props.display !== false,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
      }),
      fallback: source,
    }
  } catch {
    return { ok: false as const, html: '', fallback: source }
  }
})
</script>

<template>
  <div v-if="rendered.ok" class="formula" :class="{ display: display !== false }" v-html="rendered.html" />
  <pre v-else class="fallback">{{ rendered.fallback || latex }}</pre>
</template>

<style scoped>
.formula {
  overflow-x: auto;
  line-height: 1.6;
}

.formula.display {
  text-align: center;
  padding: 0.35rem 0.25rem;
}

.formula :deep(.katex) {
  font-size: 1.15em;
}

.fallback {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.92rem;
  white-space: pre-wrap;
  color: var(--muted);
}
</style>
