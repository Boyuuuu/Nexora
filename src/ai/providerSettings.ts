import { readZhidaSettings, writeZhidaSettings, type ZhidaSettings } from './settings'

export type AiMode = 'single' | 'dual'

export type StructuredResponseFormat = 'json_schema' | 'json_object'

export interface StructuredSettings {
  /** Bearer token for an OpenAI-compatible Chat Completions API. */
  apiKey: string
  /** OpenAI-compatible Chat Completions base URL (e.g. /openai or https://api.example.com). Empty until configured. */
  baseUrl: string
  /** Model id (e.g. gpt-4o-mini, deepseek-chat). Empty until configured. */
  model: string
  /**
   * json_schema = API-enforced schema (preferred).
   * json_object = valid JSON object only; schema still validated in-app.
   */
  responseFormat: StructuredResponseFormat
}

export interface AiProviderSettings {
  mode: AiMode
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
    baseUrl: envBase,
    model: envModel,
    responseFormat: 'json_schema',
  }
}

export function defaultAiProviderSettings(): AiProviderSettings {
  return {
    mode: 'single',
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
      mode: parsed.mode === 'dual' ? 'dual' : 'single',
      zhida: {
        ...defaults.zhida,
        ...(parsed.zhida ?? {}),
        accessSecret: typeof parsed.zhida?.accessSecret === 'string' ? parsed.zhida.accessSecret.trim() : defaults.zhida.accessSecret,
        baseUrl: typeof parsed.zhida?.baseUrl === 'string' && parsed.zhida.baseUrl.trim() ? parsed.zhida.baseUrl.trim() : defaults.zhida.baseUrl,
        model: typeof parsed.zhida?.model === 'string' && parsed.zhida.model.trim() ? parsed.zhida.model as ZhidaSettings['model'] : defaults.zhida.model,
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
    mode: settings.mode,
    zhida: {
      accessSecret: settings.zhida.accessSecret.trim(),
      model: settings.zhida.model,
      baseUrl: settings.zhida.baseUrl.trim().replace(/\/$/, '') || '/zhida',
      useSearch: settings.zhida.useSearch !== false,
    },
    structured: {
      apiKey: settings.structured.apiKey.trim(),
      baseUrl: settings.structured.baseUrl.trim().replace(/\/$/, ''),
      model: settings.structured.model.trim(),
      responseFormat: settings.structured.responseFormat,
    },
  }))
}

export function structuredConfigured(settings?: StructuredSettings): boolean {
  const value = settings ?? readAiProviderSettings().structured
  return Boolean(value.apiKey.trim() && value.model.trim() && value.baseUrl.trim())
}
