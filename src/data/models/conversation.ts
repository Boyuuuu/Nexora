export type ConversationRole = 'user' | 'assistant' | 'system'

export const CONVERSATION_ROLES = [
  'user',
  'assistant',
  'system',
] as const satisfies readonly ConversationRole[]

export interface ConversationMessage {
  id: string
  role: ConversationRole
  content: string
  createdAt: string
}

export interface ConversationMetadata {
  createdAt: string
  updatedAt: string
}

/** Structure only — no model or API is wired to this yet. */
export interface Conversation {
  id: string
  workspaceId: string
  title?: string
  messages: ConversationMessage[]
  metadata: ConversationMetadata
}

export function isConversationRole(value: unknown): value is ConversationRole {
  return typeof value === 'string' && (CONVERSATION_ROLES as readonly string[]).includes(value)
}
