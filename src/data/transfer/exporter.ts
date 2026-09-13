import type { Asset } from '../models/asset'
import type { Conversation } from '../models/conversation'
import type { Note } from '../models/note'
import { assetRepository } from '../repositories/assetRepository'
import { conversationRepository } from '../repositories/conversationRepository'
import { NotFoundError } from '../repositories/internal'
import { noteRepository } from '../repositories/noteRepository'
import { workspaceRepository } from '../repositories/workspaceRepository'
import {
  blobToBase64,
  createEnvelope,
  type AssetSnapshot,
  type BackupSnapshot,
  type NoteSnapshot,
  type Snapshot,
  type WorkspaceBundle,
  type WorkspaceSnapshot,
} from './snapshot'
import { parseSnapshot } from './validate'

/** Orders records the way the workspace lists them, with any stragglers last. */
function inDeclaredOrder<T extends { id: string }>(declared: string[], records: T[]): T[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  const ordered = declared
    .map((id) => byId.get(id))
    .filter((record): record is T => record !== undefined)
  const seen = new Set(ordered.map((record) => record.id))
  return [...ordered, ...records.filter((record) => !seen.has(record.id))]
}

async function toAssetSnapshot(asset: Asset): Promise<AssetSnapshot> {
  const { data, ...rest } = asset
  return { ...rest, data: await blobToBase64(data) }
}

async function buildBundle(workspaceId: string): Promise<WorkspaceBundle> {
  const workspace = await workspaceRepository.getById(workspaceId)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${workspaceId}`)
  }

  const notes: Note[] = inDeclaredOrder(
    workspace.noteIds,
    await noteRepository.getByWorkspaceId(workspaceId),
  )
  const conversations: Conversation[] = inDeclaredOrder(
    workspace.conversationIds,
    await conversationRepository.getByWorkspaceId(workspaceId),
  )
  const storedAssets = inDeclaredOrder(
    workspace.assetIds,
    await assetRepository.getByWorkspaceId(workspaceId),
  )
  const assets: AssetSnapshot[] = []
  for (const asset of storedAssets) {
    assets.push(await toAssetSnapshot(asset))
  }

  return {
    // The stores are the source of truth, so the exported reference lists are
    // normalised to what actually came back. A snapshot is therefore always
    // internally consistent, even if the database had drifted.
    workspace: {
      ...workspace,
      noteIds: notes.map((note) => note.id),
      conversationIds: conversations.map((conversation) => conversation.id),
      assetIds: assets.map((asset) => asset.id),
    },
    notes,
    conversations,
    assets,
  }
}

export async function exportWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  return { ...createEnvelope(), kind: 'workspace', bundle: await buildBundle(workspaceId) }
}

/** Full backup: every workspace in the database. */
export async function exportBackupSnapshot(): Promise<BackupSnapshot> {
  const workspaces = await workspaceRepository.getAll()
  const bundles: WorkspaceBundle[] = []
  for (const workspace of workspaces) {
    bundles.push(await buildBundle(workspace.id))
  }
  return { ...createEnvelope(), kind: 'backup', bundles }
}

export async function exportNoteSnapshot(noteId: string): Promise<NoteSnapshot> {
  const note = await noteRepository.getById(noteId)
  if (!note) {
    throw new NotFoundError(`Note not found: ${noteId}`)
  }
  return { ...createEnvelope(), kind: 'note', note }
}

export function snapshotToJson(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

export function snapshotToBlob(snapshot: Snapshot): Blob {
  return new Blob([snapshotToJson(snapshot)], { type: 'application/json' })
}

/** Reads a picked file and validates it before the caller sees it. */
export async function readSnapshotBlob(file: Blob): Promise<Snapshot> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new SyntaxError(`the file is not valid JSON: ${(error as Error).message}`)
  }
  return parseSnapshot(raw)
}
