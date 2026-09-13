import { assetRepository } from '../repositories/assetRepository'
import { createBlock } from '../repositories/blockRepository'
import { conversationRepository, createMessage } from '../repositories/conversationRepository'
import { graphRepository } from '../repositories/graphRepository'
import { noteRepository } from '../repositories/noteRepository'
import { workspaceRepository } from '../repositories/workspaceRepository'
import type { Asset } from '../models/asset'
import type { Conversation } from '../models/conversation'
import type { GraphEdge, GraphNode } from '../models/graph'
import type { Note } from '../models/note'
import type { Workspace } from '../models/workspace'

export const DEMO_WORKSPACE_NAME = 'Transformer Learning'
export const DEMO_NOTE_TITLE = 'What is Attention?'

export interface DemoWorkspace {
  workspace: Workspace
  note: Note
  nodes: { transformer: GraphNode; attention: GraphNode; qkv: GraphNode }
  edges: { contains: GraphEdge; usesQkv: GraphEdge }
  conversation: Conversation
  asset: Asset
}

/** Removes any previous demo workspace so a verification run starts clean. */
export async function resetDemoWorkspace(): Promise<void> {
  const workspaces = await workspaceRepository.getAll()
  for (const workspace of workspaces) {
    if (workspace.metadata.name === DEMO_WORKSPACE_NAME) {
      await workspaceRepository.delete(workspace.id)
    }
  }
}

export async function findDemoWorkspace(): Promise<Workspace | undefined> {
  const workspaces = await workspaceRepository.getAll()
  return workspaces.find((workspace) => workspace.metadata.name === DEMO_WORKSPACE_NAME)
}

export async function seedDemoWorkspace(): Promise<DemoWorkspace> {
  const workspace = await workspaceRepository.createWorkspace(
    DEMO_WORKSPACE_NAME,
    'Working through the Transformer architecture from scratch.',
  )

  const note = await noteRepository.createNote({
    workspaceId: workspace.id,
    title: DEMO_NOTE_TITLE,
    blocks: [
      createBlock(
        'concept',
        {
          title: 'Attention',
          content:
            'Attention lets a token read from every other token and weigh how much each one matters.',
        },
        { source: 'user', tags: ['transformer', 'core'] },
      ),
      createBlock(
        'intuition',
        {
          title: 'A soft lookup table',
          content:
            'A query asks a question, keys advertise what each token offers, values carry the payload.',
        },
        { source: 'user' },
      ),
      createBlock(
        'math',
        {
          title: 'Scaled dot-product attention',
          latex: '\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^{T}}{\\sqrt{d_k}}\\right)V',
          explanation: 'Dividing by sqrt(d_k) keeps the softmax out of its saturated region.',
        },
        { source: 'user' },
      ),
      createBlock(
        'example',
        {
          title: 'Resolving a pronoun',
          content:
            'In "the cat sat because it was tired", the token "it" attends strongly to "cat".',
        },
        { source: 'user' },
      ),
    ],
  })

  const transformer = await graphRepository.addNode(workspace.id, {
    label: 'Transformer',
    type: 'architecture',
  })
  const attention = await graphRepository.addNode(workspace.id, {
    label: 'Attention',
    type: 'mechanism',
    noteId: note.id,
  })
  const qkv = await graphRepository.addNode(workspace.id, {
    label: 'QKV',
    type: 'component',
  })

  const contains = await graphRepository.addEdge(workspace.id, {
    source: transformer.id,
    target: attention.id,
    type: 'contains',
  })
  const usesQkv = await graphRepository.addEdge(workspace.id, {
    source: attention.id,
    target: qkv.id,
    type: 'uses',
  })

  const conversation = await conversationRepository.createConversation({
    workspaceId: workspace.id,
    title: 'Unpacking attention',
    messages: [
      createMessage('user', 'Why does attention divide by the square root of d_k?'),
      createMessage(
        'assistant',
        'Without it the dot products grow with dimension and softmax saturates into near one-hot weights.',
      ),
      createMessage('user', 'So the gradients would vanish?'),
      createMessage('assistant', 'Right — a saturated softmax passes almost no gradient back.'),
    ],
  })

  const asset = await assetRepository.createAsset({
    workspaceId: workspace.id,
    name: 'attention-diagram.svg',
    type: 'image',
    data: new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], {
      type: 'image/svg+xml',
    }),
  })

  const storedWorkspace = await workspaceRepository.getById(workspace.id)
  const storedNote = await noteRepository.getById(note.id)
  if (!storedWorkspace || !storedNote) {
    throw new Error('Demo workspace failed to persist')
  }

  return {
    workspace: storedWorkspace,
    note: storedNote,
    nodes: { transformer, attention, qkv },
    edges: { contains, usesQkv },
    conversation,
    asset,
  }
}
