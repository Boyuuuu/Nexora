import { readZhidaSettings, writeZhidaSettings, type ZhidaSettings } from './settings'

export type StructuredResponseFormat = 'json_schema' | 'json_object'

export interface StructuredSettings {
  /** Bearer token for an OpenAI-compatible Chat Completions API. */
  apiKey: string
  /** Dev default `/openai` (Vite proxy). Production: full origin or your own proxy. */
  baseUrl: string
  /** e.g. gpt-4o-mini, deepseek-chat, moonshot-v1-8k — must support JSON mode / schema. */
  model: string
  /**
   * json_schema = API-enforced schema (preferred).
   * json_object = valid JSON object only; schema still validated in-app.
   */
  responseFormat: StructuredResponseFormat
}

export interface AiProviderSettings {
  zhida: ZhidaSettings
  structured: StructuredSettings
}

const STORAGE_KEY = 'nexora.ai.providers'

export function defaultStructuredSettings(): StructuredSettings {
  const envKey = typeof import.meta.env.VITE_STRUCTURED_API_KEY === 'string'
    ? import.meta.env.VITE_STRUCTURED_API_KEY.trim()
    : ''
  const envModel = typeof import.meta.env.VITE_STRUCTURED_MODEL === 'string'
    ? import.meta.env.VITE_STRUCTURED_MODEL.trim()
    : ''
  const envBase = typeof import.meta.env.VITE_STRUCTURED_BASE_URL === 'string'
    ? import.meta.env.VITE_STRUCTURED_BASE_URL.trim()
    : ''
  return {
    apiKey: envKey,
    baseUrl: envBase || '/openai',
    model: envModel || 'gpt-4o-mini',
    responseFormat: 'json_schema',
  }
}

export function defaultAiProviderSettings(): AiProviderSettings {
  return {
    zhida: readZhidaSettings(),
    structured: defaultStructuredSettings(),
  }
}

export function readAiProviderSettings(): AiProviderSettings {
  const defaults = defaultAiProviderSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<AiProviderSettings>
    const structured = {
      ...defaults.structured,
      ...(parsed.structured ?? {}),
    }
    return {
      zhida: {
        ...defaults.zhida,
        ...(parsed.zhida ?? {}),
        accessSecret: parsed.zhida?.accessSecret?.trim() || defaults.zhida.accessSecret,
        baseUrl: parsed.zhida?.baseUrl?.trim() || defaults.zhida.baseUrl,
        model: parsed.zhida?.model ?? defaults.zhida.model,
        useSearch: typeof parsed.zhida?.useSearch === 'boolean'
          ? parsed.zhida.useSearch
          : defaults.zhida.useSearch,
      },
      structured: {
        apiKey: typeof structured.apiKey === 'string' ? structured.apiKey.trim() : defaults.structured.apiKey,
        baseUrl: typeof structured.baseUrl === 'string' && structured.baseUrl.trim()
          ? structured.baseUrl.trim().replace(/\/$/, '')
          : defaults.structured.baseUrl,
        model: typeof structured.model === 'string' && structured.model.trim()
          ? structured.model.trim()
          : defaults.structured.model,
        responseFormat: structured.responseFormat === 'json_object' ? 'json_object' : 'json_schema',
      },
    }
  } catch {
    return defaults
  }
}

export function writeAiProviderSettings(settings: AiProviderSettings): void {
  writeZhidaSettings(settings.zhida)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    zhida: {
      accessSecret: settings.zhida.accessSecret.trim(),
      model: settings.zhida.model,
      baseUrl: settings.zhida.baseUrl.trim().replace(/\/$/, '') || '/zhida',
      useSearch: settings.zhida.useSearch !== false,
    },
    structured: {
      apiKey: settings.structured.apiKey.trim(),
      baseUrl: settings.structured.baseUrl.trim().replace(/\/$/, '') || '/openai',
      model: settings.structured.model.trim() || 'gpt-4o-mini',
      responseFormat: settings.structured.responseFormat,
    },
  }))
}

export function structuredConfigured(settings?: StructuredSettings): boolean {
  const value = settings ?? readAiProviderSettings().structured
  return Boolean(value.apiKey.trim() && value.model.trim() && value.baseUrl.trim())
}
