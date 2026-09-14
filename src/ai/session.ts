import { computed, ref } from 'vue'
import type { Block } from '../data'
import type { EditPatch, QuoteRef } from './protocol'

export interface SelectionToolbar {
  x: number
  y: number
  blockId: string
  text: string
}

const quotes = ref<QuoteRef[]>([])
const pendingPatches = ref<EditPatch[]>([])
const rewriteMode = ref(false)
const selectionToolbar = ref<SelectionToolbar | null>(null)
const focusedPreviewId = ref<string | null>(null)
const quoteVersion = ref(0)

export function useAiSession() {
  return {
    quotes: computed(() => quotes.value),
    pendingPatches: computed(() => pendingPatches.value),
    rewriteMode,
    selectionToolbar,
    focusedPreviewId,

    addQuote(blockId: string, text: string): void {
      const clipped = text.replace(/\s+/g, ' ').trim()
      if (!clipped) return
      const exists = quotes.value.some((item) => item.blockId === blockId && item.text === clipped)
      if (exists) return
      quotes.value = [
        ...quotes.value,
        { id: `qt_${Date.now()}_${quoteVersion.value++}`, blockId, text: clipped },
      ]
    },

    removeQuote(id: string): void {
      quotes.value = quotes.value.filter((item) => item.id !== id)
    },

    clearQuotes(): void {
      quotes.value = []
    },

    setPendingPatches(patches: EditPatch[]): void {
      pendingPatches.value = patches
      focusedPreviewId.value = patches[0]?.block_id ?? null
    },

    clearPending(): void {
      pendingPatches.value = []
      focusedPreviewId.value = null
    },

    patchFor(blockId: string): EditPatch | undefined {
      return pendingPatches.value.find((item) => item.block_id === blockId && item.action !== 'create')
    },

    ghostAfter(blockId: string | null, options?: { last?: boolean }): EditPatch[] {
      return pendingPatches.value.filter((item) => {
        if (item.action !== 'create') return false
        if (blockId === null) return item.after_block_id === null
        if (item.after_block_id === blockId) return true
        return Boolean(options?.last && item.after_block_id === undefined)
      })
    },

    showSelectionToolbar(next: SelectionToolbar): void {
      selectionToolbar.value = next
    },

    hideSelectionToolbar(): void {
      selectionToolbar.value = null
    },
  }
}

export function blockHasPending(block: Block): boolean {
  return pendingPatches.value.some((item) => item.block_id === block.id)
}
