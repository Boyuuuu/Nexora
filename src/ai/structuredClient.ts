import {
  readAiProviderSettings,
  structuredConfigured,
  type StructuredResponseFormat,
} from './providerSettings'
import { structuredSchema, type StructuredSchemaName } from './schemas'

export class StructuredError extends Error {
  override name = 'StructuredError'
  readonly status?: number
  readonly code?: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.status = options?.status
    this.code = options?.code
  }
}

export interface StructuredMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function endpoint(baseUrl: string): string {
  const root = baseUrl.replace(/\/$/, '')
  if (root.endsWith('/v1')) return `${root}/chat/completions`
  if (root.endsWith('/chat/completions')) return root
  return `${root}/v1/chat/completions`
}

function describeHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } }
    if (parsed.error?.message) return parsed.error.message
  } catch {
    /* ignore */
  }
  if (status === 401 || status === 403) return '结构化模型鉴权失败，请检查 API Key。'
  if (status === 429) return '结构化模型请求过于频繁，请稍后再试。'
  return body.trim() || `结构化请求失败（${status}）`
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text ?? '')
      return ''
    }).join('')
  }
  return ''
}

function extractContent(parsed: unknown): string {
  const record = parsed as {
    error?: { message?: string; code?: string }
    choices?: Array<{ message?: Record<string, unknown> }>
  }
  if (record.error?.message) {
    throw new StructuredError(record.error.message, { code: record.error.code })
  }
  const message = record.choices?.[0]?.message
  if (!message) return ''
  // Some providers put structured args on tool_calls; we only use content JSON mode.
  return asText(message.content)
}

function buildResponseFormat(
  format: StructuredResponseFormat,
  schemaName: StructuredSchemaName,
): Record<string, unknown> {
  if (format === 'json_object') {
    return { type: 'json_object' }
  }
  const spec = structuredSchema(schemaName)
  return {
    type: 'json_schema',
    json_schema: {
      name: spec.name,
      strict: spec.strict,
      schema: spec.schema,
      ...(spec.description ? { description: spec.description } : {}),
    },
  }
}

/**
 * Call an OpenAI-compatible Chat Completions endpoint with JSON enforcement.
 * Prefer json_schema; automatically retries once with json_object if the provider rejects schema mode.
 */
export async function completeStructuredJson(
  messages: StructuredMessage[],
  options: {
    schema: StructuredSchemaName
    signal?: AbortSignal
    responseFormat?: StructuredResponseFormat
  },
): Promise<{ content: string; parsed: unknown }> {
  const settings = readAiProviderSettings().structured
  if (!structuredConfigured(settings)) {
    throw new StructuredError('请先在设置里配置「结构化模型」API Key（支持 JSON Schema / JSON Object 的 OpenAI 兼容接口）。')
  }

  const prefer = options.responseFormat ?? settings.responseFormat
  const formats: StructuredResponseFormat[] = prefer === 'json_schema'
    ? ['json_schema', 'json_object']
    : ['json_object']

  let lastError: StructuredError | null = null

  for (const format of formats) {
    const body = {
      model: settings.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: false,
      response_format: buildResponseFormat(format, options.schema),
      temperature: 0.2,
    }

    if (import.meta.env.DEV) {
      console.debug('[nexora:structured] request', {
        model: body.model,
        format,
        schema: options.schema,
        messageCount: body.messages.length,
      })
    }

    let response: Response
    try {
      response = await fetch(endpoint(settings.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new StructuredError(error instanceof Error ? error.message : '结构化网络请求失败。')
    }

    const text = await response.text().catch(() => '')
    if (!response.ok) {
      const message = describeHttpError(response.status, text)
      lastError = new StructuredError(message, { status: response.status })
      // Retry with json_object when schema mode is unsupported.
      const schemaRejected = format === 'json_schema' && (
        response.status === 400
        || /response_format|json_schema|unknown field|not supported/i.test(message)
      )
      if (schemaRejected) continue
      throw lastError
    }

    let parsedResponse: unknown
    try {
      parsedResponse = JSON.parse(text)
    } catch {
      throw new StructuredError('结构化模型返回了无法解析的 HTTP 响应。')
    }

    const content = extractContent(parsedResponse).trim()
    if (!content) {
      throw new StructuredError('结构化模型没有返回 content。')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      // Rare: provider claimed JSON but wrapped fences.
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
      if (!fenced) {
        throw new StructuredError(`结构化模型返回了非 JSON content。预览：${content.slice(0, 160)}`)
      }
      try {
        parsed = JSON.parse(fenced)
      } catch {
        throw new StructuredError(`结构化模型返回了非法 JSON。预览：${content.slice(0, 160)}`)
      }
    }

    if (import.meta.env.DEV) {
      console.debug('[nexora:structured] response', { format, preview: content.slice(0, 240) })
    }

    return { content, parsed }
  }

  throw lastError ?? new StructuredError('结构化请求失败。')
}
