import { readZhidaSettings, type ZhidaModel } from './settings'

export class ZhidaError extends Error {
  override name = 'ZhidaError'
  readonly status?: number
  readonly code?: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.status = options?.status
    this.code = options?.code
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatStreamHandlers {
  onReasoning?: (chunk: string, full: string) => void
  onContent?: (chunk: string, full: string) => void
}

interface ChatRequest {
  model: ZhidaModel
  messages: ChatMessage[]
  stream?: boolean
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
}

function headers(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
    'Content-Type': 'application/json',
  }
}

function describeHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } }
    if (parsed.error?.message) return parsed.error.message
  } catch {
    /* not JSON */
  }
  if (status === 401 || status === 403) return 'API 鉴权失败，请检查 Access Secret。'
  if (status === 429) return '请求过于频繁，请稍后再试。'
  return body.trim() || `请求失败（${status}）`
}

/**
 * Zhihu chat often rejects messages that look like prompt templates.
 * Fold "system" text after the real user task, without 【系统指令】 wrappers.
 */
export function toZhidaMessages(messages: ChatMessage[]): ChatMessage[] {
  const systemParts: string[] = []
  const rest: ChatMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') systemParts.push(message.content.trim())
    else rest.push({ ...message, content: message.content.trim() })
  }
  if (!systemParts.length) return rest

  const rules = systemParts.join('\n\n')
  if (!rest.length) {
    return [{ role: 'user', content: rules }]
  }

  const [first, ...tail] = rest
  if (first?.role === 'user') {
    return [
      {
        role: 'user',
        content: [
          first.content,
          '',
          '——',
          '输出要求：',
          rules,
        ].join('\n'),
      },
      ...tail,
    ]
  }
  return [{ role: 'user', content: rules }, ...rest]
}

function readSettings() {
  const settings = readZhidaSettings()
  if (!settings.accessSecret) {
    throw new ZhidaError('请先在设置里填写 Access Secret。')
  }
  return settings
}

/** Prefer fast model for structured JSON — thinking models often never emit content. */
export function structureModel(preferred?: ZhidaModel): ZhidaModel {
  return preferred === 'zhida-fast-1p5' ? preferred : 'zhida-fast-1p5'
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

function readAssistantMessage(parsed: unknown): { reasoning: string; content: string } {
  const record = parsed as {
    error?: { message?: string; code?: string }
    choices?: Array<{ message?: Record<string, unknown> }>
    data?: { choices?: Array<{ message?: Record<string, unknown> }> }
  }
  if (record.error?.message) {
    throw new ZhidaError(record.error.message, { code: record.error.code })
  }
  const message = record.choices?.[0]?.message ?? record.data?.choices?.[0]?.message
  if (!message) return { reasoning: '', content: '' }
  return {
    reasoning: asText(message.reasoning_content ?? message.reasoning),
    content: asText(message.content ?? message.answer ?? message.text ?? message.output),
  }
}

export async function completeZhidaChat(
  messages: ChatMessage[],
  options?: { model?: ZhidaModel; signal?: AbortSignal },
): Promise<{ reasoning: string; content: string }> {
  const settings = readSettings()
  const body: ChatRequest = {
    model: options?.model ?? settings.model,
    messages: toZhidaMessages(messages),
    stream: false,
  }

  if (import.meta.env.DEV) {
    console.debug('[nexora:zhida] request', { model: body.model, messages: body.messages })
  }

  const response = await fetch(endpoint(settings.baseUrl), {
    method: 'POST',
    headers: headers(settings.accessSecret),
    body: JSON.stringify(body),
    signal: options?.signal,
  })

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new ZhidaError(describeHttpError(response.status, text), { status: response.status })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ZhidaError('模型返回了无法解析的响应。')
  }

  const result = readAssistantMessage(parsed)
  if (import.meta.env.DEV) {
    console.debug('[nexora:zhida] response', {
      contentPreview: result.content.slice(0, 300),
      reasoningPreview: result.reasoning.slice(0, 300),
    })
  }
  return result
}

export async function streamZhidaChat(
  messages: ChatMessage[],
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
  options?: { model?: ZhidaModel },
): Promise<{ reasoning: string; content: string }> {
  const settings = readSettings()
  const body: ChatRequest = {
    model: options?.model ?? settings.model,
    messages: toZhidaMessages(messages),
    stream: true,
  }

  const response = await fetch(endpoint(settings.baseUrl), {
    method: 'POST',
    headers: headers(settings.accessSecret),
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ZhidaError(describeHttpError(response.status, text), { status: response.status })
  }

  if (!response.body) {
    throw new ZhidaError('模型没有返回内容。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reasoning = ''
  let content = ''

  const consumeEvent = (rawEvent: string): 'done' | 'continue' => {
    const dataLines = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
    if (!dataLines.length) return 'continue'
    const payload = dataLines.join('\n')
    if (payload === '[DONE]') return 'done'

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      return 'continue'
    }
    if (!parsed || typeof parsed !== 'object') return 'continue'
    const record = parsed as {
      error?: { message?: string; code?: string }
      choices?: Array<{
        finish_reason?: string | null
        delta?: { reasoning_content?: string; content?: string }
        message?: { reasoning_content?: string; content?: string }
      }>
    }
    if (record.error?.message) {
      throw new ZhidaError(record.error.message, { code: record.error.code })
    }
    const choice = record.choices?.[0]
    if (!choice) return 'continue'
    if (choice.finish_reason === 'error') {
      throw new ZhidaError(record.error?.message ?? '模型在生成中途失败。')
    }
    const delta = choice.delta ?? choice.message ?? {}
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      reasoning += delta.reasoning_content
      handlers.onReasoning?.(delta.reasoning_content, reasoning)
    }
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content
      handlers.onContent?.(delta.content, content)
    }
    return 'continue'
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')

    let separator: number
    while ((separator = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      if (consumeEvent(rawEvent) === 'done') {
        return { reasoning, content }
      }
    }
  }

  // Flush a trailing event that never got a final blank line.
  if (buffer.trim()) consumeEvent(buffer.trim())
  return { reasoning, content }
}
