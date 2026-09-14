import { computed, ref } from 'vue'
import type { QuoteRef } from './protocol'

export interface SelectionToolbar {
  x: number
  y: number
  blockId: string
  text: string
}

const quotes = ref<QuoteRef[]>([])
const selectionToolbar = ref<SelectionToolbar | null>(null)
const focusedPreviewId = ref<string | null>(null)
const quoteVersion = ref(0)

export function useAiSession() {
  return {
    quotes: computed(() => quotes.value),
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

    showSelectionToolbar(next: SelectionToolbar): void {
      selectionToolbar.value = next
    },

    hideSelectionToolbar(): void {
      selectionToolbar.value = null
    },
  }
}
