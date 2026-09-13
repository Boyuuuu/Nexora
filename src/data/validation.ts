import { isAssetType, type Asset } from './models/asset'
import { isBlockSource, isBlockType, type Block, type BlockMetadata } from './models/block'
import {
  isConversationRole,
  type Conversation,
  type ConversationMessage,
} from './models/conversation'
import {
  isGraphEdgeType,
  isGraphNodeType,
  type Graph,
  type GraphEdge,
  type GraphNode,
} from './models/graph'
import type { Note } from './models/note'
import type { Workspace } from './models/workspace'
import { isIsoTimestamp } from './utils/time'

export class ValidationError extends Error {
  override name = 'ValidationError'
}

function fail(message: string): never {
  throw new ValidationError(message)
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${field} must be a non-empty string`)
  }
  return value
}

function requireTimestamp(value: unknown, field: string): void {
  if (!isIsoTimestamp(value)) {
    fail(`${field} must be an ISO 8601 UTC timestamp`)
  }
}

function requireFiniteNumber(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite number`)
  }
}

function requireIdArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array`)
  }
  value.forEach((item, index) => requireNonEmptyString(item, `${field}[${index}]`))
  if (new Set(value).size !== value.length) {
    fail(`${field} must not contain duplicates`)
  }
}

function requireOptionalTags(tags: unknown, field: string): void {
  if (tags === undefined) {
    return
  }
  if (!Array.isArray(tags)) {
    fail(`${field} must be an array of strings`)
  }
  tags.forEach((tag, index) => requireNonEmptyString(tag, `${field}[${index}]`))
}

export function validateWorkspace(workspace: Workspace): void {
  requireNonEmptyString(workspace.id, 'workspace.id')
  requireNonEmptyString(workspace.metadata?.name, 'workspace.metadata.name')
  if (
    workspace.metadata.description !== undefined &&
    typeof workspace.metadata.description !== 'string'
  ) {
    fail('workspace.metadata.description must be a string when present')
  }
  requireTimestamp(workspace.metadata.createdAt, 'workspace.metadata.createdAt')
  requireTimestamp(workspace.metadata.updatedAt, 'workspace.metadata.updatedAt')
  requireIdArray(workspace.noteIds, 'workspace.noteIds')
  requireIdArray(workspace.conversationIds, 'workspace.conversationIds')
  requireIdArray(workspace.assetIds, 'workspace.assetIds')
  validateGraph(workspace.graph, workspace.id)
}

export function validateGraph(graph: Graph, workspaceId: string): void {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    fail('workspace.graph must contain nodes[] and edges[]')
  }

  const nodeIds = new Set<string>()
  for (const node of graph.nodes) {
    validateGraphNode(node, workspaceId)
    if (nodeIds.has(node.id)) {
      fail(`duplicate graph node id: ${node.id}`)
    }
    nodeIds.add(node.id)
  }

  const edgeIds = new Set<string>()
  for (const edge of graph.edges) {
    validateGraphEdge(edge, workspaceId, nodeIds)
    if (edgeIds.has(edge.id)) {
      fail(`duplicate graph edge id: ${edge.id}`)
    }
    edgeIds.add(edge.id)
  }
}

export function validateGraphNode(node: GraphNode, workspaceId: string): void {
  requireNonEmptyString(node.id, 'graphNode.id')
  requireNonEmptyString(node.label, 'graphNode.label')
  if (!isGraphNodeType(node.type)) {
    fail(`graphNode.type is not supported: ${String(node.type)}`)
  }
  if (node.workspaceId !== workspaceId) {
    fail(`graphNode.workspaceId must be ${workspaceId}`)
  }
  if (node.noteId !== undefined) {
    requireNonEmptyString(node.noteId, 'graphNode.noteId')
  }
  if (node.position !== undefined) {
    requireFiniteNumber(node.position?.x, 'graphNode.position.x')
    requireFiniteNumber(node.position.y, 'graphNode.position.y')
  }
}

export function validateGraphEdge(
  edge: GraphEdge,
  workspaceId: string,
  knownNodeIds: ReadonlySet<string>,
): void {
  requireNonEmptyString(edge.id, 'graphEdge.id')
  if (!isGraphEdgeType(edge.type)) {
    fail(`graphEdge.type is not supported: ${String(edge.type)}`)
  }
  if (edge.workspaceId !== workspaceId) {
    fail(`graphEdge.workspaceId must be ${workspaceId}`)
  }
  requireNonEmptyString(edge.source, 'graphEdge.source')
  requireNonEmptyString(edge.target, 'graphEdge.target')
  if (!knownNodeIds.has(edge.source)) {
    fail(`graphEdge.source references unknown node: ${edge.source}`)
  }
  if (!knownNodeIds.has(edge.target)) {
    fail(`graphEdge.target references unknown node: ${edge.target}`)
  }
}

export function validateNote(note: Note): void {
  requireNonEmptyString(note.id, 'note.id')
  requireNonEmptyString(note.workspaceId, 'note.workspaceId')
  requireNonEmptyString(note.title, 'note.title')
  requireTimestamp(note.metadata?.createdAt, 'note.metadata.createdAt')
  requireTimestamp(note.metadata.updatedAt, 'note.metadata.updatedAt')

  if (!Array.isArray(note.blocks)) {
    fail('note.blocks must be an array')
  }

  const blockIds = new Set<string>()
  for (const block of note.blocks) {
    validateBlock(block)
    if (blockIds.has(block.id)) {
      fail(`duplicate block id: ${block.id}`)
    }
    blockIds.add(block.id)
  }
}

export function validateBlock(block: Block): void {
  requireNonEmptyString(block.id, 'block.id')
  if (!isBlockType(block.type)) {
    fail(`block.type is not supported: ${String(block.type)}`)
  }
  validateBlockMetadata(block.metadata)
  validateBlockData(block)
}

function validateBlockMetadata(metadata: BlockMetadata): void {
  requireTimestamp(metadata?.createdAt, 'block.metadata.createdAt')
  requireTimestamp(metadata.updatedAt, 'block.metadata.updatedAt')
  if (metadata.source !== undefined && !isBlockSource(metadata.source)) {
    fail(`block.metadata.source is not supported: ${String(metadata.source)}`)
  }
  requireOptionalTags(metadata.tags, 'block.metadata.tags')
}

function validateBlockData(block: Block): void {
  switch (block.type) {
    case 'text':
    case 'example':
      requireNonEmptyString(block.data?.content, `block(${block.type}).data.content`)
      return
    case 'concept':
    case 'intuition':
      requireNonEmptyString(block.data?.title, `block(${block.type}).data.title`)
      requireNonEmptyString(block.data.content, `block(${block.type}).data.content`)
      return
    case 'math':
      requireNonEmptyString(block.data?.latex, 'block(math).data.latex')
      return
    case 'code':
      requireNonEmptyString(block.data?.language, 'block(code).data.language')
      requireNonEmptyString(block.data.code, 'block(code).data.code')
      return
    case 'exploration':
      if (!Array.isArray(block.data?.items) || block.data.items.length === 0) {
        fail('block(exploration).data.items must be a non-empty array')
      }
      block.data.items.forEach((item, index) =>
        requireNonEmptyString(item, `block(exploration).data.items[${index}]`),
      )
      return
  }
}

export function validateConversation(conversation: Conversation): void {
  requireNonEmptyString(conversation.id, 'conversation.id')
  requireNonEmptyString(conversation.workspaceId, 'conversation.workspaceId')
  if (conversation.title !== undefined) {
    requireNonEmptyString(conversation.title, 'conversation.title')
  }
  requireTimestamp(conversation.metadata?.createdAt, 'conversation.metadata.createdAt')
  requireTimestamp(conversation.metadata.updatedAt, 'conversation.metadata.updatedAt')

  if (!Array.isArray(conversation.messages)) {
    fail('conversation.messages must be an array')
  }

  const messageIds = new Set<string>()
  for (const message of conversation.messages) {
    validateConversationMessage(message)
    if (messageIds.has(message.id)) {
      fail(`duplicate conversation message id: ${message.id}`)
    }
    messageIds.add(message.id)
  }
}

export function validateConversationMessage(message: ConversationMessage): void {
  requireNonEmptyString(message.id, 'conversationMessage.id')
  requireNonEmptyString(message.content, 'conversationMessage.content')
  requireTimestamp(message.createdAt, 'conversationMessage.createdAt')
  if (!isConversationRole(message.role)) {
    fail(`conversationMessage.role is not supported: ${String(message.role)}`)
  }
}

export function validateAsset(asset: Asset): void {
  requireNonEmptyString(asset.id, 'asset.id')
  requireNonEmptyString(asset.workspaceId, 'asset.workspaceId')
  requireNonEmptyString(asset.name, 'asset.name')
  requireNonEmptyString(asset.mimeType, 'asset.mimeType')
  if (!isAssetType(asset.type)) {
    fail(`asset.type is not supported: ${String(asset.type)}`)
  }
  if (!(asset.data instanceof Blob)) {
    fail('asset.data must be a Blob')
  }
  if (!Number.isInteger(asset.size) || asset.size < 0) {
    fail('asset.size must be a non-negative integer')
  }
  if (asset.size !== asset.data.size) {
    fail('asset.size must match asset.data.size')
  }
  requireTimestamp(asset.metadata?.createdAt, 'asset.metadata.createdAt')
  requireTimestamp(asset.metadata.updatedAt, 'asset.metadata.updatedAt')
}
