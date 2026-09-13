/**
 * Importing is all-or-nothing: every record is decoded, remapped and validated
 * first, and the writes then happen in a single transaction across all four
 * stores. A file that turns out to be broken half-way through therefore leaves
 * the database exactly as it was.
 */

import { runTransaction } from '../db/database'
import { INDEXES, STORES } from '../db/schema'
import type { Asset } from '../models/asset'
import type { Conversation } from '../models/conversation'
import type { GraphEdge, GraphNode } from '../models/graph'
import type { Note } from '../models/note'
import type { Workspace } from '../models/workspace'
import { NotFoundError, saveWorkspace, withId } from '../repositories/internal'
import { createId } from '../utils/id'
import {
  validateAsset,
  validateConversation,
  validateNote,
  validateWorkspace,
} from '../validation'
import {
  base64ToBlob,
  SnapshotError,
  type Snapshot,
  type WorkspaceBundle,
} from './snapshot'

export type ImportMode = 'restore' | 'copy'

export interface ImportOptions {
  /**
   * `restore` keeps the ids from the file (a backup going back where it came
   * from); `copy` mints new ids so the import can sit next to the original.
   */
  mode: ImportMode
  /** `restore` only: replace a workspace that already exists. */
  overwrite?: boolean
  /** `note` snapshots only: which workspace receives the note. */
  workspaceId?: string
}

export interface ImportSummary {
  mode: ImportMode
  workspaceIds: string[]
  noteIds: string[]
  blocks: number
  nodes: number
  edges: number
  conversations: number
  assets: number
}

/** A bundle with its assets decoded back into Blobs, ready to be written. */
interface PreparedBundle {
  workspace: Workspace
  notes: Note[]
  conversations: Conversation[]
  assets: Asset[]
}

function decodeBundle(bundle: WorkspaceBundle): PreparedBundle {
  return {
    workspace: bundle.workspace,
    notes: bundle.notes,
    conversations: bundle.conversations,
    assets: bundle.assets.map(({ data, ...rest }) => ({
      ...rest,
      data: base64ToBlob(data, rest.mimeType),
    })),
  }
}

function mapped(map: Map<string, string>, id: string, what: string): string {
  const next = map.get(id)
  if (next === undefined) {
    throw new SnapshotError('BROKEN_REFERENCE', `${what} references ${id}, absent from the file`)
  }
  return next
}

/** Mints a new id for everything in the bundle and rewires every reference. */
function remapBundle(bundle: PreparedBundle): PreparedBundle {
  const workspaceId = createId('ws')
  const noteIds = new Map(bundle.notes.map((note) => [note.id, createId('note')]))
  const nodeIds = new Map(
    bundle.workspace.graph.nodes.map((node) => [node.id, createId('node')]),
  )
  const conversationIds = new Map(
    bundle.conversations.map((conversation) => [conversation.id, createId('conv')]),
  )
  const assetIds = new Map(bundle.assets.map((asset) => [asset.id, createId('asset')]))

  const nodes: GraphNode[] = bundle.workspace.graph.nodes.map((node) => ({
    ...node,
    id: mapped(nodeIds, node.id, 'graph node'),
    workspaceId,
    ...(node.noteId === undefined
      ? {}
      : { noteId: mapped(noteIds, node.noteId, `graph node ${node.id}.noteId`) }),
  }))

  const edges: GraphEdge[] = bundle.workspace.graph.edges.map((edge) => ({
    ...edge,
    id: createId('edge'),
    workspaceId,
    source: mapped(nodeIds, edge.source, `edge ${edge.id}.source`),
    target: mapped(nodeIds, edge.target, `edge ${edge.id}.target`),
  }))

  const notes: Note[] = bundle.notes.map((note) => ({
    ...note,
    id: mapped(noteIds, note.id, 'note'),
    workspaceId,
    blocks: note.blocks.map((block) => ({ ...block, id: createId('block') })),
  }))

  const conversations: Conversation[] = bundle.conversations.map((conversation) => ({
    ...conversation,
    id: mapped(conversationIds, conversation.id, 'conversation'),
    workspaceId,
    messages: conversation.messages.map((message) => ({ ...message, id: createId('msg') })),
  }))

  const assets: Asset[] = bundle.assets.map((asset) => ({
    ...asset,
    id: mapped(assetIds, asset.id, 'asset'),
    workspaceId,
  }))

  return {
    workspace: {
      ...bundle.workspace,
      id: workspaceId,
      metadata: {
        ...bundle.workspace.metadata,
        name: `${bundle.workspace.metadata.name} (副本)`,
      },
      noteIds: notes.map((note) => note.id),
      conversationIds: conversations.map((conversation) => conversation.id),
      assetIds: assets.map((asset) => asset.id),
      graph: { nodes, edges },
    },
    notes,
    conversations,
    assets,
  }
}

function validateBundle(bundle: PreparedBundle): void {
  validateWorkspace(bundle.workspace)
  bundle.notes.forEach((note) => validateNote(note))
  bundle.conversations.forEach((conversation) => validateConversation(conversation))
  bundle.assets.forEach((asset) => validateAsset(asset))
}

function summarise(mode: ImportMode, bundles: PreparedBundle[]): ImportSummary {
  return {
    mode,
    workspaceIds: bundles.map((bundle) => bundle.workspace.id),
    noteIds: bundles.flatMap((bundle) => bundle.notes.map((note) => note.id)),
    blocks: bundles.reduce(
      (total, bundle) =>
        total + bundle.notes.reduce((count, note) => count + note.blocks.length, 0),
      0,
    ),
    nodes: bundles.reduce((total, bundle) => total + bundle.workspace.graph.nodes.length, 0),
    edges: bundles.reduce((total, bundle) => total + bundle.workspace.graph.edges.length, 0),
    conversations: bundles.reduce((total, bundle) => total + bundle.conversations.length, 0),
    assets: bundles.reduce((total, bundle) => total + bundle.assets.length, 0),
  }
}

async function importBundles(
  raw: WorkspaceBundle[],
  options: ImportOptions,
): Promise<ImportSummary> {
  const bundles = raw
    .map(decodeBundle)
    .map((bundle) => (options.mode === 'copy' ? remapBundle(bundle) : bundle))
  bundles.forEach(validateBundle)

  await runTransaction(
    [STORES.workspaces, STORES.notes, STORES.conversations, STORES.assets],
    'readwrite',
    async (ctx) => {
      const workspaces = ctx.store<Workspace>(STORES.workspaces)
      const notes = ctx.store<Note>(STORES.notes)
      const conversations = ctx.store<Conversation>(STORES.conversations)
      const assets = ctx.store<Asset>(STORES.assets)

      for (const bundle of bundles) {
        const workspaceId = bundle.workspace.id
        const existing = await workspaces.get(workspaceId)

        if (existing) {
          if (options.mode === 'copy') {
            throw new SnapshotError('IMPORT_CONFLICT', `id collision while copying: ${workspaceId}`)
          }
          if (!options.overwrite) {
            throw new SnapshotError(
              'IMPORT_CONFLICT',
              `Workspace already exists: ${workspaceId} — enable overwrite to replace it`,
            )
          }
          // Drop the current children so nothing from the old state survives.
          for (const note of await notes.getAllByIndex(INDEXES.byWorkspaceId, workspaceId)) {
            await notes.delete(note.id)
          }
          for (const conversation of await conversations.getAllByIndex(
            INDEXES.byWorkspaceId,
            workspaceId,
          )) {
            await conversations.delete(conversation.id)
          }
          for (const asset of await assets.getAllByIndex(INDEXES.byWorkspaceId, workspaceId)) {
            await assets.delete(asset.id)
          }
        }

        // `put`, not `saveWorkspace`: a snapshot keeps its own timestamps.
        await workspaces.put(bundle.workspace)
        for (const note of bundle.notes) {
          await notes.put(note)
        }
        for (const conversation of bundle.conversations) {
          await conversations.put(conversation)
        }
        for (const asset of bundle.assets) {
          await assets.put(asset)
        }
      }
    },
  )

  return summarise(options.mode, bundles)
}

async function importNote(note: Note, options: ImportOptions): Promise<ImportSummary> {
  const workspaceId = options.workspaceId
  if (workspaceId === undefined) {
    throw new SnapshotError('MISSING_TARGET', 'importing a note requires a target workspace id')
  }

  const prepared: Note =
    options.mode === 'copy'
      ? {
          ...note,
          id: createId('note'),
          workspaceId,
          blocks: note.blocks.map((block) => ({ ...block, id: createId('block') })),
        }
      : { ...note, workspaceId }
  validateNote(prepared)

  await runTransaction([STORES.workspaces, STORES.notes], 'readwrite', async (ctx) => {
    const workspaces = ctx.store<Workspace>(STORES.workspaces)
    const notes = ctx.store<Note>(STORES.notes)

    const workspace = await workspaces.get(workspaceId)
    if (!workspace) {
      throw new NotFoundError(`Workspace not found: ${workspaceId}`)
    }

    const existing = await notes.get(prepared.id)
    if (existing) {
      if (options.mode === 'copy' || !options.overwrite) {
        throw new SnapshotError('IMPORT_CONFLICT', `Note already exists: ${prepared.id}`)
      }
      if (existing.workspaceId !== workspaceId) {
        throw new SnapshotError(
          'IMPORT_CONFLICT',
          `Note ${prepared.id} already exists in another workspace`,
        )
      }
    }

    await notes.put(prepared)
    await saveWorkspace(ctx, { ...workspace, noteIds: withId(workspace.noteIds, prepared.id) })
  })

  return {
    mode: options.mode,
    workspaceIds: [workspaceId],
    noteIds: [prepared.id],
    blocks: prepared.blocks.length,
    nodes: 0,
    edges: 0,
    conversations: 0,
    assets: 0,
  }
}

export function importSnapshot(snapshot: Snapshot, options: ImportOptions): Promise<ImportSummary> {
  switch (snapshot.kind) {
    case 'workspace':
      return importBundles([snapshot.bundle], options)
    case 'backup':
      return importBundles(snapshot.bundles, options)
    case 'note':
      return importNote(snapshot.note, options)
  }
}
