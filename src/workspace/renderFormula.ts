import katex from 'katex'
import 'katex/dist/katex.min.css'

export interface RenderedFormula {
  html: string
  error: string | null
}

/** Strip accidental surrounding $$ / $ so KaTeX gets the expression itself. */
function normalizeLatex(source: string): string {
  const trimmed = source.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    return trimmed.slice(1, -1).trim()
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return trimmed.slice(2, -2).trim()
  }
  return trimmed
}

export function renderFormula(latex: string, displayMode = true): RenderedFormula {
  const expression = normalizeLatex(latex)
  if (!expression) {
    return { html: '', error: null }
  }

  try {
    return {
      html: katex.renderToString(expression, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
      }),
      error: null,
    }
  } catch (error) {
    return {
      html: '',
      error: error instanceof Error ? error.message : 'Could not render formula',
    }
  }
}
