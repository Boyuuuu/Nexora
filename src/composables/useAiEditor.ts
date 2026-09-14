import { computed, ref } from 'vue'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useWorkspaceUi } from './useWorkspaceUi'
import { buildEditUserPrompt, buildSelectedBlockBodies } from '../ai/context'
import { getAiSkill } from '../ai/skills'
import {
  parseEditPatches,
  parseEditPlan,
  type EditPatch,
  type EditPlan,
} from '../ai/protocol'
import { useAiSession } from '../ai/session'
import { patchesToOperations, undoOneBlock, undoOperations, type EditTask } from '../ai/applyEdit'
import { completeStructuredJson, StructuredError } from '../ai/structuredClient'
import {
  readAiProviderSettings,
  structuredConfigured,
  writeAiProviderSettings,
  type AiProviderSettings,
} from '../ai/providerSettings'
import { ZhidaError } from '../ai/zhidaClient'
import {
  buildZhihuSearchQuery,
  searchZhihuContent,
  type ZhihuSearchItem,
} from '../ai/zhihuSearch'
import type { Operation } from '../operations'
import { blockBody } from '../workspace/labels'

const settings = ref<AiProviderSettings>(readAiProviderSettings())
const settingsOpen = ref(false)
const busy = ref(false)
const phase = ref<'idle' | 'planning' | 'planned' | 'patching' | 'preview' | 'applying'>('idle')
const reasoning = ref('')
const draftAnswer = ref('')
const plan = ref<EditPlan | null>(null)
const patches = ref<EditPatch[]>([])
const searchHits = ref<ZhihuSearchItem[]>([])
const error = ref<string | null>(null)
const lastTask = ref<EditTask | null>(null)
const lastInstruction = ref('')
let abort: AbortController | null = null

export function useAiEditor() {
  const store = useKnowledgeStore()
  const ui = useWorkspaceUi()
  const session = useAiSession()
  const skill = getAiSkill()

  const canEdit = computed(() => Boolean(store.workspace.value && store.note.value && ui.mode.value === 'note'))
  const selectedCount = computed(() => plan.value?.targets.filter((item) => item.selected).length ?? 0)
  const structuredReady = computed(() => structuredConfigured(settings.value.structured))

  function persistSettings(next: AiProviderSettings): void {
    settings.value = next
    writeAiProviderSettings(next)
  }

  function stop(): void {
    abort?.abort()
    abort = null
    busy.value = false
  }

  async function runOperations(operations: Operation[]): Promise<void> {
    for (const operation of operations) {
      const result = await store.run(operation)
      if (!result.success) {
        throw new Error(result.error?.message ?? '操作失败')
      }
    }
  }

  async function maybeSearchZhihu(
    instruction: string,
    noteTitle: string,
    signal: AbortSignal,
  ): Promise<ZhihuSearchItem[]> {
    if (!settings.value.zhida.useSearch || !settings.value.zhida.accessSecret) {
      searchHits.value = []
      return []
    }
    draftAnswer.value = '正在搜索知乎相关内容…'
    try {
      const result = await searchZhihuContent(
        buildZhihuSearchQuery(instruction, noteTitle),
        { count: 5, sortBy: 'VoteUpCount:desc', signal },
      )
      searchHits.value = result.items
      return result.items
    } catch (caught) {
      if (isAbort(caught)) throw caught
      // Grounding is best-effort: edit should still work if search fails.
      console.warn('[nexora:zhihu-search]', caught)
      searchHits.value = []
      return []
    }
  }

  async function send(): Promise<void> {
    const note = store.note.value
    const workspace = store.workspace.value
    const instruction = ui.aiDraft.value.trim()
    if (!instruction || !note || !workspace) {
      ui.showToast(note ? '请先输入你想改什么。' : '请先打开一篇笔记再让 AI 编辑。')
      return
    }
    if (!structuredReady.value) {
      ui.showToast('请先打开设置，配置结构化模型 API Key。')
      settingsOpen.value = true
      return
    }
    if (busy.value) return

    lastInstruction.value = instruction
    error.value = null
    plan.value = null
    patches.value = []
    searchHits.value = []
    session.clearPending()
    if (/重写|全文改写|整篇改写|rewrite/i.test(instruction)) {
      session.rewriteMode.value = true
    }
    ui.pushAiMessage('user', instruction)
    ui.aiDraft.value = ''
    busy.value = true
    phase.value = 'planning'
    reasoning.value = ''
    draftAnswer.value = '正在准备…'
    abort?.abort()
    abort = new AbortController()

    try {
      const hits = await maybeSearchZhihu(instruction, note.title, abort.signal)
      draftAnswer.value = hits.length
        ? `已找到 ${hits.length} 条知乎结果，正在规划改动…`
        : '正在让模型规划改动…'

      const user = buildEditUserPrompt({
        instruction,
        note,
        graph: store.graph.value,
        quotes: [...session.quotes.value],
        rewrite: session.rewriteMode.value,
        languageHint: '请用和我需求相同的语言写 summary、intent。',
        zhihuSearchItems: hits,
      })
      const { content, parsed } = await completeStructuredJson(
        [
          { role: 'system', content: skill.prompts.plan },
          { role: 'user', content: user },
        ],
        { schema: 'edit_plan', signal: abort.signal },
      )
      draftAnswer.value = content
      const next = parseEditPlan(parsed, note.blocks, session.rewriteMode.value ? 'rewrite' : 'edit')
      if (!session.rewriteMode.value && next.targets.length > skill.limits.maxEditBlocks) {
        next.targets = next.targets.slice(0, skill.limits.maxEditBlocks)
      }
      plan.value = next
      phase.value = 'planned'
      ui.pushAiMessage('assistant', next.summary)
    } catch (caught) {
      if (isAbort(caught)) {
        phase.value = 'idle'
        return
      }
      error.value = describe(caught)
      phase.value = 'idle'
      ui.pushAiMessage('assistant', error.value)
    } finally {
      busy.value = false
      abort = null
    }
  }

  async function generatePatches(): Promise<void> {
    const note = store.note.value
    if (!note || !plan.value) return
    const selected = plan.value.targets.filter((item) => item.selected)
    if (!selected.length) {
      ui.showToast('请至少勾选一个要改的块。')
      return
    }
    if (!structuredReady.value) {
      ui.showToast('请先配置结构化模型 API Key。')
      settingsOpen.value = true
      return
    }

    abort?.abort()
    abort = new AbortController()
    busy.value = true
    phase.value = 'patching'
    error.value = null
    draftAnswer.value = '正在生成结构化补丁…'

    try {
      const hits = searchHits.value.length
        ? searchHits.value
        : await maybeSearchZhihu(lastInstruction.value, note.title, abort.signal)

      const user = [
        `我想继续改这篇学习笔记，具体需求是：${lastInstruction.value}`,
        `当前计划：${plan.value.summary}`,
        '',
        '请只针对下面勾选的项生成 patches：',
        JSON.stringify(selected, null, 2),
        '',
        '这些块现在的内容：',
        buildSelectedBlockBodies(note, selected.flatMap((item) => item.block_id ? [item.block_id] : [])),
        '',
        hits.length
          ? [
              '知乎站内搜索摘录（仅供参考，不要大段照抄）：',
              hits.slice(0, 5).map((item, index) => (
                `${index + 1}. ${item.title} — ${item.contentText.replace(/\s+/g, ' ').slice(0, 180)}`
              )).join('\n'),
              '',
            ].join('\n')
          : '',
        '如果需求是历史，正文请写历史脉络，不要只重复定义。',
      ].filter(Boolean).join('\n')

      const { content, parsed } = await completeStructuredJson(
        [
          { role: 'system', content: skill.prompts.patch },
          { role: 'user', content: user },
        ],
        { schema: 'edit_patch', signal: abort.signal },
      )
      draftAnswer.value = content
      const next = parseEditPatches(parsed, note.blocks, selected)
      patches.value = next
      session.setPendingPatches(next)
      phase.value = 'preview'
    } catch (caught) {
      if (isAbort(caught)) {
        phase.value = 'planned'
        return
      }
      error.value = describe(caught)
      phase.value = 'planned'
    } finally {
      busy.value = false
      abort = null
    }
  }

  async function apply(): Promise<void> {
    const note = store.note.value
    const workspace = store.workspace.value
    if (!note || !workspace || !patches.value.length) return
    busy.value = true
    phase.value = 'applying'
    try {
      const { operations, snapshots } = patchesToOperations(workspace.id, note, patches.value)
      if (!operations.length) throw new Error('没有可写入的改动。')
      await runOperations(operations)
      lastTask.value = {
        id: `task_${Date.now()}`,
        workspaceId: workspace.id,
        noteId: note.id,
        changes: snapshots,
      }
      session.clearPending()
      session.clearQuotes()
      patches.value = []
      plan.value = null
      phase.value = 'idle'
      ui.showToast('已应用 AI 改动。可以按任务或逐块撤销。')
    } catch (caught) {
      error.value = describe(caught)
      phase.value = 'preview'
      ui.showToast('应用失败，笔记未完整写入。')
    } finally {
      busy.value = false
    }
  }

  function discardPreview(): void {
    session.clearPending()
    patches.value = []
    phase.value = plan.value ? 'planned' : 'idle'
  }

  function discardPlan(): void {
    discardPreview()
    plan.value = null
    phase.value = 'idle'
    reasoning.value = ''
    draftAnswer.value = ''
    searchHits.value = []
  }

  async function undoTask(): Promise<void> {
    const task = lastTask.value
    if (!task || store.note.value?.id !== task.noteId) {
      ui.showToast('没有可撤销的 AI 改动。')
      return
    }
    busy.value = true
    try {
      await runOperations(undoOperations(task))
      lastTask.value = null
      ui.showToast('已撤销这一次 AI 改动。')
    } catch (caught) {
      ui.showToast(describe(caught))
    } finally {
      busy.value = false
    }
  }

  async function undoBlock(blockId: string): Promise<void> {
    const task = lastTask.value
    if (!task) return
    busy.value = true
    try {
      const { operations, remaining } = undoOneBlock(task, blockId)
      if (!operations.length) {
        ui.showToast('这个块没有可撤销的 AI 改动。')
        return
      }
      await runOperations(operations)
      lastTask.value = remaining.length ? { ...task, changes: remaining } : null
      ui.showToast('已撤销这个块的 AI 改动。')
    } catch (caught) {
      ui.showToast(describe(caught))
    } finally {
      busy.value = false
    }
  }

  function quoteActiveBlock(): void {
    const block = store.blocks.value.find((item) => item.id === ui.selectedBlockId.value)
    if (!block) {
      ui.showToast('先选中一个 block，或用鼠标划选文字。')
      return
    }
    session.addQuote(block.id, blockBody(block).slice(0, 500))
    ui.openAiPanel()
  }

  function askAboutBlock(blockId: string, prompt: string): void {
    const block = store.blocks.value.find((item) => item.id === blockId)
    if (!block) return
    session.addQuote(block.id, blockBody(block).slice(0, 500))
    ui.selectBlock(block.id)
    ui.inspectOpen.value = false
    ui.openAiPanel()
    ui.aiDraft.value = prompt
  }

  return {
    store,
    ui,
    session,
    settings,
    settingsOpen,
    busy,
    phase,
    reasoning,
    draftAnswer,
    plan,
    patches,
    searchHits,
    error,
    lastTask,
    canEdit,
    selectedCount,
    structuredReady,
    skill,
    persistSettings,
    stop,
    send,
    generatePatches,
    apply,
    discardPreview,
    discardPlan,
    undoTask,
    undoBlock,
    quoteActiveBlock,
    askAboutBlock,
  }
}

function describe(error: unknown): string {
  if (error instanceof StructuredError || error instanceof ZhidaError) return error.message
  if (error instanceof DOMException && error.name === 'AbortError') return '已停止生成。'
  return error instanceof Error ? error.message : String(error)
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
