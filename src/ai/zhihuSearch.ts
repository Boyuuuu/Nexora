import { readZhidaSettings, type ZhidaSettings } from './settings'
import { ZhidaError } from './zhidaClient'

export interface ZhihuSearchComment {
  content: string
}

export interface ZhihuSearchItem {
  title: string
  contentType: string
  contentId: string
  contentText: string
  url: string
  commentCount: number
  voteUpCount: number
  authorName: string
  authorAvatar: string
  authorBadge: string
  authorBadgeText: string
  editTime: number
  commentInfoList: ZhihuSearchComment[]
  authorityLevel: string
  rankingScore: number
}

export interface ZhihuSearchResult {
  hasMore: boolean
  searchHashId: string
  items: ZhihuSearchItem[]
  emptyReason?: string
}

export interface ZhihuSearchOptions {
  count?: number
  /** e.g. VoteUpCount:desc:(10,) — see Zhihu OpenAPI docs */
  sortBy?: string
  signal?: AbortSignal
    settings?: ZhidaSettings
}

interface ApiItem {
  Title?: string
  ContentType?: string
  ContentID?: string
  ContentText?: string
  Url?: string
  CommentCount?: number
  VoteUpCount?: number
  AuthorName?: string
  AuthorAvatar?: string
  AuthorBadge?: string
  AuthorBadgeText?: string
  EditTime?: number
  CommentInfoList?: Array<{ Content?: string }>
  AuthorityLevel?: string
  RankingScore?: number
}

function zhihuHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
    'Content-Type': 'application/json',
  }
}

function searchEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/v1/content/zhihu_search`
}

function mapItem(raw: ApiItem): ZhihuSearchItem {
  return {
    title: String(raw.Title ?? ''),
    contentType: String(raw.ContentType ?? ''),
    contentId: String(raw.ContentID ?? ''),
    contentText: String(raw.ContentText ?? ''),
    url: String(raw.Url ?? ''),
    commentCount: Number(raw.CommentCount ?? 0),
    voteUpCount: Number(raw.VoteUpCount ?? 0),
    authorName: String(raw.AuthorName ?? ''),
    authorAvatar: String(raw.AuthorAvatar ?? ''),
    authorBadge: String(raw.AuthorBadge ?? ''),
    authorBadgeText: String(raw.AuthorBadgeText ?? ''),
    editTime: Number(raw.EditTime ?? 0),
    commentInfoList: Array.isArray(raw.CommentInfoList)
      ? raw.CommentInfoList.map((item) => ({ content: String(item.Content ?? '') }))
      : [],
    authorityLevel: String(raw.AuthorityLevel ?? ''),
    rankingScore: Number(raw.RankingScore ?? 0),
  }
}

function describeError(status: number, body: string, code?: number): string {
  if (code === 10001) return '知乎搜索参数错误。'
  if (code === 20001 || status === 401 || status === 403) return '知乎搜索鉴权失败，请检查 Access Secret。'
  if (code === 30001 || status === 429) return '知乎搜索请求过于频繁，请稍后再试。'
  if (code === 90001) return '知乎搜索服务内部错误。'
  try {
    const parsed = JSON.parse(body) as { Message?: string; message?: string }
    if (parsed.Message || parsed.message) return String(parsed.Message || parsed.message)
  } catch {
    /* ignore */
  }
  return body.trim() || `知乎搜索失败（${status}）`
}

/**
 * Zhihu site search (questions / answers / articles).
 * Uses the same Access Secret + baseUrl as 直答 (`/zhida` proxy in dev).
 */
export async function searchZhihuContent(
  query: string,
  options?: ZhihuSearchOptions,
): Promise<ZhihuSearchResult> {
  const q = query.replace(/\s+/g, ' ').trim()
  if (!q) throw new ZhidaError('搜索关键词不能为空。', { code: '10001' })

  const settings = options?.settings ?? readZhidaSettings()
  if (!settings.accessSecret) {
    throw new ZhidaError('请先在设置里填写知乎 Access Secret。')
  }

  const count = Math.min(10, Math.max(1, options?.count ?? 5))
  const params = new URLSearchParams()
  params.set('Query', q)
  params.set('Count', String(count))
  if (options?.sortBy?.trim()) params.set('SortBy', options.sortBy.trim())

  const url = `${searchEndpoint(settings.baseUrl)}?${params.toString()}`
  if (import.meta.env.DEV) {
    console.debug('[nexora:zhihu-search] request', { query: q, count, sortBy: options?.sortBy })
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: zhihuHeaders(settings.accessSecret),
    signal: options?.signal,
  })
  const text = await response.text().catch(() => '')

  let parsed: {
    Code?: number
    Message?: string
    Data?: {
      HasMore?: boolean
      SearchHashId?: string
      Items?: ApiItem[]
      EmptyReason?: string
    }
  }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    throw new ZhidaError(describeError(response.status, text), { status: response.status })
  }

  if (!response.ok || (typeof parsed.Code === 'number' && parsed.Code !== 0)) {
    throw new ZhidaError(
      describeError(response.status, text, parsed.Code),
      { status: response.status, code: String(parsed.Code ?? response.status) },
    )
  }

  const data = parsed.Data
  const result: ZhihuSearchResult = {
    hasMore: Boolean(data?.HasMore),
    searchHashId: String(data?.SearchHashId ?? ''),
    items: Array.isArray(data?.Items) ? data.Items.map(mapItem) : [],
    ...(data?.EmptyReason ? { emptyReason: String(data.EmptyReason) } : {}),
  }

  if (import.meta.env.DEV) {
    console.debug('[nexora:zhihu-search] response', {
      count: result.items.length,
      emptyReason: result.emptyReason,
    })
  }
  return result
}

/** Compact lines for LLM grounding — not for verbatim long quotes. */
export function formatZhihuSearchForPrompt(items: ZhihuSearchItem[], limit = 5): string {
  if (!items.length) return '（知乎搜索无结果）'
  return items.slice(0, limit).map((item, index) => {
    const excerpt = item.contentText.replace(/\s+/g, ' ').trim().slice(0, 220)
    return [
      `${index + 1}. [${item.contentType}] ${item.title}`,
      `   作者：${item.authorName || '未知'} · 赞同 ${item.voteUpCount} · 评论 ${item.commentCount}`,
      excerpt ? `   摘要：${excerpt}${item.contentText.length > 220 ? '…' : ''}` : '',
      item.url ? `   链接：${item.url}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n')
}

/** Build a search query from note title + user instruction. */
export function buildZhihuSearchQuery(instruction: string, noteTitle?: string): string {
  const ask = instruction.replace(/\s+/g, ' ').trim()
  const title = (noteTitle ?? '').replace(/\s+/g, ' ').trim()
  if (title && ask && !ask.includes(title)) {
    return `${title} ${ask}`.slice(0, 120)
  }
  return (ask || title).slice(0, 120)
}
