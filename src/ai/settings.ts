export const ZHIDA_MODELS = ['zhida-fast-1p5', 'zhida-thinking-1p5', 'zhida-agent'] as const

export type ZhidaModel = (typeof ZHIDA_MODELS)[number]

export const ZHIDA_MODEL_LABELS: Record<ZhidaModel, string> = {
  'zhida-fast-1p5': '快速回答',
  'zhida-thinking-1p5': '深度思考',
  'zhida-agent': '智能思考',
}

const STORAGE_KEY = 'nexora.ai.zhida'

export interface ZhidaSettings {
  accessSecret: string
  model: ZhidaModel
  baseUrl: string
  /** When true, chat can reference Zhihu site search results. */
  useSearch: boolean
}

function envSecret(): string {
  const value = import.meta.env.VITE_ZHIDA_ACCESS_SECRET
  return typeof value === 'string' ? value.trim() : ''
}

export function defaultZhidaSettings(): ZhidaSettings {
  return {
    accessSecret: envSecret(),
    model: 'zhida-thinking-1p5',
    baseUrl: '/zhida',
    useSearch: true,
  }
}

export function readZhidaSettings(): ZhidaSettings {
  const defaults = defaultZhidaSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<ZhidaSettings>
    const model = ZHIDA_MODELS.includes(parsed.model as ZhidaModel)
      ? (parsed.model as ZhidaModel)
      : defaults.model
    return {
      accessSecret: typeof parsed.accessSecret === 'string'
        ? parsed.accessSecret.trim()
        : defaults.accessSecret,
      model,
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim().replace(/\/$/, '')
        : defaults.baseUrl,
      useSearch: typeof parsed.useSearch === 'boolean' ? parsed.useSearch : defaults.useSearch,
    }
  } catch {
    return defaults
  }
}

export function writeZhidaSettings(settings: ZhidaSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    accessSecret: settings.accessSecret.trim(),
    model: settings.model,
    baseUrl: settings.baseUrl.trim().replace(/\/$/, '') || '/zhida',
    useSearch: settings.useSearch !== false,
  }))
}

export function isZhidaModel(value: string): value is ZhidaModel {
  return (ZHIDA_MODELS as readonly string[]).includes(value)
}
