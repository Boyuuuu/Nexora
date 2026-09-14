import { runTransaction } from '../db/database'
import { INDEXES, STORES } from '../db/schema'
import type {
  Conversation,
  ConversationMessage,
  ConversationRole,
} from '../models/conversation'
import type { Workspace } from '../models/workspace'
import { createId } from '../utils/id'
import { nowIso } from '../utils/time'
import { validateConversation } from '../validation'
import {
  ConflictError,
  loadWorkspace,
  NotFoundError,
  saveWorkspace,
  withId,
  withoutId,
} from './internal'

export interface CreateConversationInput {
  workspaceId: string
  noteId?: string
  title?: string
  messages?: ConversationMessage[]
}

export function createMessage(role: ConversationRole, content: string): ConversationMessage {
  return { id: createId('msg'), role, content, createdAt: nowIso() }
}

export function buildConversation(input: CreateConversationInput): Conversation {
  const timestamp = nowIso()
  return {
    id: createId('conv'),
    workspaceId: input.workspaceId,
    ...(input.noteId ? { noteId: input.noteId } : {}),
    ...(input.title === undefined ? {} : { title: input.title }),
    messages: input.messages ?? [],
    metadata: { createdAt: timestamp, updatedAt: timestamp },
  }
}

export const conversationRepository = {
  createMessage,

  createConversation(input: CreateConversationInput): Promise<Conversation> {
    return conversationRepository.create(buildConversation(input))
  },

  async create(conversation: Conversation): Promise<Conversation> {
    validateConversation(conversation)
    return runTransaction([STORES.workspaces, STORES.conversations], 'readwrite', async (ctx) => {
      const conversations = ctx.store<Conversation>(STORES.conversations)
      if (await conversations.get(conversation.id)) {
        throw new ConflictError(`Conversation already exists: ${conversation.id}`)
      }

      const workspace = await loadWorkspace(ctx, conversation.workspaceId)
      await conversations.add(conversation)
      await saveWorkspace(ctx, {
        ...workspace,
        conversationIds: withId(workspace.conversationIds, conversation.id),
      })
      return conversation
    })
  },

  getById(id: string): Promise<Conversation | undefined> {
    return runTransaction(STORES.conversations, 'readonly', (ctx) =>
      ctx.store<Conversation>(STORES.conversations).get(id),
    )
  },

  getByWorkspaceId(workspaceId: string): Promise<Conversation[]> {
    return runTransaction(STORES.conversations, 'readonly', (ctx) =>
      ctx
        .store<Conversation>(STORES.conversations)
        .getAllByIndex(INDEXES.byWorkspaceId, workspaceId),
    )
  },

  async update(conversation: Conversation): Promise<Conversation> {
    validateConversation(conversation)
    return runTransaction(STORES.conversations, 'readwrite', async (ctx) => {
      const conversations = ctx.store<Conversation>(STORES.conversations)
      const existing = await conversations.get(conversation.id)
      if (!existing) {
        throw new NotFoundError(`Conversation not found: ${conversation.id}`)
      }
      if (existing.workspaceId !== conversation.workspaceId) {
        throw new ConflictError('Moving a conversation between workspaces is not supported')
      }

      const updated: Conversation = {
        ...conversation,
        metadata: { createdAt: existing.metadata.createdAt, updatedAt: nowIso() },
      }
      await conversations.put(updated)
      return updated
    })
  },

  async appendMessage(
    conversationId: string,
    role: ConversationRole,
    content: string,
  ): Promise<Conversation> {
    return runTransaction(STORES.conversations, 'readwrite', async (ctx) => {
      const conversations = ctx.store<Conversation>(STORES.conversations)
      const existing = await conversations.get(conversationId)
      if (!existing) {
        throw new NotFoundError(`Conversation not found: ${conversationId}`)
      }

      const updated: Conversation = {
        ...existing,
        messages: [...existing.messages, createMessage(role, content)],
        metadata: { ...existing.metadata, updatedAt: nowIso() },
      }
      validateConversation(updated)
      await conversations.put(updated)
      return updated
    })
  },

  async delete(id: string): Promise<void> {
    await runTransaction([STORES.workspaces, STORES.conversations], 'readwrite', async (ctx) => {
      const conversations = ctx.store<Conversation>(STORES.conversations)
      const conversation = await conversations.get(id)
      if (!conversation) {
        throw new NotFoundError(`Conversation not found: ${id}`)
      }

      await conversations.delete(id)

      const workspace = await ctx.store<Workspace>(STORES.workspaces).get(conversation.workspaceId)
      if (workspace) {
        await saveWorkspace(ctx, {
          ...workspace,
          conversationIds: withoutId(workspace.conversationIds, id),
        })
      }
    })
  },
}
