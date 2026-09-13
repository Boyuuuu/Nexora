import { computed, ref } from 'vue'

export type WorkspaceMode = 'note' | 'canvas' | 'explore'

export interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

export interface AiPrompt {
  label: string
  text: string
}

const RECENT_KEY = 'nexora.workspace.recentNoteIds'
const PANELS_KEY = 'nexora.workspace.panels'

const mode = ref<WorkspaceMode>('note')
const selectedBlockId = ref<string | null>(null)
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const isSidebarOpen = ref(true)
const isAiPanelOpen = ref(true)
const recentNoteIds = ref<string[]>(readRecent())
const focusNodeId = ref<string | null>(null)
const searchQuery = ref('')
const toast = ref<string | null>(null)
const confirmRequest = ref<ConfirmRequest | null>(null)
const aiMessages = ref<AiMessage[]>([])
const aiDraft = ref('')
const inspectOpen = ref(false)

let confirmResolve: ((ok: boolean) => void) | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function persistRecent(): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentNoteIds.value.slice(0, 8)))
}

function readPanels(): void {
  try {
    const raw = localStorage.getItem(PANELS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { sidebar?: boolean; ai?: boolean }
    if (typeof parsed.sidebar === 'boolean') isSidebarOpen.value = parsed.sidebar
    if (typeof parsed.ai === 'boolean') isAiPanelOpen.value = parsed.ai
  } catch {
    /* ignore */
  }
}

function persistPanels(): void {
  localStorage.setItem(
    PANELS_KEY,
    JSON.stringify({ sidebar: isSidebarOpen.value, ai: isAiPanelOpen.value }),
  )
}

readPanels()

export function useWorkspaceUi() {
  return {
    mode,
    selectedBlockId,
    selectedNodeId,
    selectedEdgeId,
    isSidebarOpen,
    isAiPanelOpen,
    recentNoteIds: computed(() => recentNoteIds.value),
    focusNodeId,
    searchQuery,
    toast: computed(() => toast.value),
    confirmRequest: computed(() => confirmRequest.value),
    aiMessages: computed(() => aiMessages.value),
    aiDraft,
    inspectOpen,

    setMode(next: WorkspaceMode): void {
      mode.value = next
      if (next !== 'canvas') {
        selectedNodeId.value = null
        selectedEdgeId.value = null
        inspectOpen.value = false
      }
      if (next !== 'note') {
        selectedBlockId.value = null
      }
      if (next === 'explore') {
        isAiPanelOpen.value = true
        persistPanels()
      }
    },

    toggleSidebar(): void {
      isSidebarOpen.value = !isSidebarOpen.value
      persistPanels()
    },

    toggleAiPanel(): void {
      if (inspectOpen.value) {
        inspectOpen.value = false
        selectedNodeId.value = null
        selectedEdgeId.value = null
        isAiPanelOpen.value = true
        persistPanels()
        return
      }
      isAiPanelOpen.value = !isAiPanelOpen.value
      persistPanels()
    },

    openAiPanel(): void {
      isAiPanelOpen.value = true
      persistPanels()
    },

    setSidebarOpen(open: boolean): void {
      isSidebarOpen.value = open
      persistPanels()
    },

    setAiPanelOpen(open: boolean): void {
      isAiPanelOpen.value = open
      persistPanels()
    },

    touchRecent(noteId: string): void {
      recentNoteIds.value = [noteId, ...recentNoteIds.value.filter((id) => id !== noteId)].slice(0, 8)
      persistRecent()
    },

    selectBlock(blockId: string | null): void {
      selectedBlockId.value = blockId
    },

    selectNode(nodeId: string | null): void {
      selectedNodeId.value = nodeId
      selectedEdgeId.value = null
      inspectOpen.value = nodeId !== null
      if (nodeId !== null) {
        isAiPanelOpen.value = true
        persistPanels()
      }
    },

    selectEdge(edgeId: string | null): void {
      selectedEdgeId.value = edgeId
      selectedNodeId.value = null
      inspectOpen.value = edgeId !== null
      if (edgeId !== null) {
        isAiPanelOpen.value = true
        persistPanels()
      }
    },

    clearSelection(): void {
      selectedBlockId.value = null
      selectedNodeId.value = null
      selectedEdgeId.value = null
      inspectOpen.value = false
    },

    requestFocusNode(nodeId: string | null): void {
      focusNodeId.value = nodeId
    },

    consumeFocusNode(): string | null {
      const id = focusNodeId.value
      focusNodeId.value = null
      return id
    },

    showToast(message: string): void {
      toast.value = message
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        toast.value = null
      }, 4200)
    },

    dismissToast(): void {
      toast.value = null
    },

    confirm(request: ConfirmRequest): Promise<boolean> {
      confirmRequest.value = request
      return new Promise((resolve) => {
        confirmResolve = resolve
      })
    },

    resolveConfirm(ok: boolean): void {
      confirmRequest.value = null
      confirmResolve?.(ok)
      confirmResolve = null
    },

    pushAiMessage(role: AiMessage['role'], content: string): void {
      aiMessages.value = [
        ...aiMessages.value,
        { id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, role, content },
      ]
    },

    clearAi(): void {
      aiMessages.value = []
      aiDraft.value = ''
    },
  }
}

export const ASK_AI_PROMPTS: AiPrompt[] = [
  { label: 'Explain this', text: 'Explain this in more depth.' },
  { label: 'Simplify', text: 'Simplify this so a beginner can understand it.' },
  { label: 'Add example', text: 'Add a concrete example for this.' },
  { label: 'Add mathematical explanation', text: 'Add a mathematical explanation for this.' },
  { label: 'Explore related concepts', text: 'Explore related concepts and how they connect.' },
]

export const EXPLORE_SUGGESTIONS: AiPrompt[] = [
  { label: 'Explain this concept', text: 'Explain the current concept and why it matters.' },
  { label: 'Find connections', text: 'Find connections between the current idea and the rest of this workspace.' },
  { label: 'Compare concepts', text: 'Compare this concept with the closest related nodes.' },
  { label: 'Explore further', text: 'What should I explore next from here?' },
]
