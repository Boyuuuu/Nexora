<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ content: string }>()
interface Section { kind: 'text' | 'code' | 'heading' | 'list'; text: string; language?: string }
const sections = computed(() => {
  const result: Section[] = []
  let code: Section | null = null
  for (const line of props.content.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      if (code) { result.push(code); code = null }
      else code = { kind: 'code', text: '', language: line.replace(/^\s*```/, '').trim() }
    } else if (code) code.text += `${line}\n`
    else if (/^#{1,6}\s/.test(line)) result.push({ kind: 'heading', text: line.replace(/^#{1,6}\s+/, '') })
    else if (/^\s*(?:[-*]|\d+\.)\s/.test(line)) result.push({ kind: 'list', text: line })
    else if (result.at(-1)?.kind === 'text') result.at(-1)!.text += `\n${line}`
    else result.push({ kind: 'text', text: line })
  }
  if (code) result.push(code)
  return result.filter((item) => item.text.trim())
})
function inline(text: string): { kind: string; text: string; href?: string }[] {
  return text.split(/(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) return { kind: 'a', text: link[1]!, href: link[2] }
    if (part.startsWith('**') && part.endsWith('**')) return { kind: 'strong', text: part.slice(2, -2) }
    if (part.startsWith('`') && part.endsWith('`')) return { kind: 'code', text: part.slice(1, -1) }
    return { kind: 'span', text: part }
  })
}
</script>

<template>
  <div class="chat-content">
    <template v-for="(section, index) in sections" :key="index">
      <div v-if="section.kind === 'code'" class="code-block"><span v-if="section.language">{{ section.language }}</span><pre><code>{{ section.text.trimEnd() }}</code></pre></div>
      <component :is="section.kind === 'heading' ? 'h4' : 'p'" v-else :class="section.kind">
        <component :is="part.kind" v-for="(part, token) in inline(section.text)" :key="token" :href="part.href" :target="part.href ? '_blank' : undefined" :rel="part.href ? 'noopener noreferrer' : undefined">{{ part.text }}</component>
      </component>
    </template>
  </div>
</template>

<style scoped>
.chat-content { font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; }
p, h4 { margin: 0 0 10px; white-space: pre-wrap; }
h4 { font-size: 15px; margin-top: 14px; }
.list { margin-bottom: 4px; padding-left: 8px; }
a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
code { font-family: var(--mono); font-size: 12px; background: var(--control-hover); border-radius: 4px; padding: 2px 4px; }
.code-block { margin: 10px 0; border-radius: 10px; background: var(--control-hover); overflow: hidden; }
.code-block > span { display: block; padding: 7px 12px 0; font-size: 11px; color: var(--muted); }
pre { margin: 0; padding: 12px; overflow-x: auto; }
pre code { padding: 0; background: transparent; white-space: pre; }
.chat-content > :last-child { margin-bottom: 0; }
</style>
