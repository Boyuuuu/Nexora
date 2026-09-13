/**
 * A snapshot arrives from a file, so nothing in it is trusted. Every record is
 * put through the data layer's own validators, and on top of that the file's
 * internal references are cross-checked: a hand-edited file must not be able
 * to plant an orphan edge or a note that claims the wrong workspace.
 */

import { isAssetType } from '../models/asset'
import type { Conversation } from '../models/conversation'
import type { Note } from '../models/note'
import type { Workspace } from '../models/workspace'
import { isIsoTimestamp } from '../utils/time'
import { validateConversation, validateNote, validateWorkspace, ValidationError } from '../validation'
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  SnapshotError,
  type AssetSnapshot,
  type BackupSnapshot,
  type NoteSnapshot,
  type Snapshot,
  type WorkspaceBundle,
  type WorkspaceSnapshot,
} from './snapshot'

function invalid(message: string): never {
  throw new SnapshotError('INVALID_SNAPSHOT', message)
}

function broken(message: string): never {
  throw new SnapshotError('BROKEN_REFERENCE', message)
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    invalid(`${field} must be an array`)
  }
  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    invalid(`${field} must be a non-empty string`)
  }
  return value
}

/** Runs a data-layer validator and re-labels its failure as a snapshot problem. */
function checked(field: string, validate: () => void): void {
  try {
    validate()
  } catch (error) {
    if (error instanceof ValidationError) {
      invalid(`${field}: ${error.message}`)
    }
    throw error
  }
}

function sameIdSet(declared: string[], actual: string[], field: string): void {
  if (declared.length !== actual.length || declared.some((id) => !actual.includes(id))) {
    broken(`${field} does not match the records in the file`)
  }
}

function parseAsset(raw: unknown, workspaceId: string, index: number): AssetSnapshot {
  const record = requireRecord(raw, `assets[${index}]`)
  const asset: AssetSnapshot = {
    id: requireString(record.id, `assets[${index}].id`),
    workspaceId: requireString(record.workspaceId, `assets[${index}].workspaceId`),
    name: requireString(record.name, `assets[${index}].name`),
    type: isAssetType(record.type)
      ? record.type
      : invalid(`assets[${index}].type is not supported: ${String(record.type)}`),
    mimeType: requireString(record.mimeType, `assets[${index}].mimeType`),
    size: Number.isInteger(record.size) && (record.size as number) >= 0
      ? (record.size as number)
      : invalid(`assets[${index}].size must be a non-negative integer`),
    data: typeof record.data === 'string'
      ? record.data
      : invalid(`assets[${index}].data must be a base64 string`),
    metadata: parseTimestamps(record.metadata, `assets[${index}].metadata`),
  }
  if (asset.workspaceId !== workspaceId) {
    broken(`assets[${index}] belongs to another workspace: ${asset.workspaceId}`)
  }
  return asset
}

function parseTimestamps(raw: unknown, field: string): { createdAt: string; updatedAt: string } {
  const record = requireRecord(raw, field)
  if (!isIsoTimestamp(record.createdAt) || !isIsoTimestamp(record.updatedAt)) {
    invalid(`${field} must hold ISO 8601 UTC timestamps`)
  }
  return { createdAt: record.createdAt as string, updatedAt: record.updatedAt as string }
}

export function parseBundle(raw: unknown, label: string): WorkspaceBundle {
  const record = requireRecord(raw, label)
  const workspace = requireRecord(record.workspace, `${label}.workspace`) as unknown as Workspace
  checked(`${label}.workspace`, () => validateWorkspace(workspace))

  const notes = requireArray(record.notes, `${label}.notes`).map((entry, index) => {
    const note = requireRecord(entry, `${label}.notes[${index}]`) as unknown as Note
    checked(`${label}.notes[${index}]`, () => validateNote(note))
    if (note.workspaceId !== workspace.id) {
      broken(`${label}.notes[${index}] belongs to another workspace: ${note.workspaceId}`)
    }
    return note
  })

  const conversations = requireArray(record.conversations ?? [], `${label}.conversations`).map(
    (entry, index) => {
      const conversation = requireRecord(
        entry,
        `${label}.conversations[${index}]`,
      ) as unknown as Conversation
      checked(`${label}.conversations[${index}]`, () => validateConversation(conversation))
      if (conversation.workspaceId !== workspace.id) {
        broken(`${label}.conversations[${index}] belongs to another workspace`)
      }
      return conversation
    },
  )

  const assets = requireArray(record.assets ?? [], `${label}.assets`).map((entry, index) =>
    parseAsset(entry, workspace.id, index),
  )

  // The workspace's own reference lists must describe exactly what is here.
  sameIdSet(workspace.noteIds, notes.map((note) => note.id), `${label}.workspace.noteIds`)
  sameIdSet(
    workspace.conversationIds,
    conversations.map((conversation) => conversation.id),
    `${label}.workspace.conversationIds`,
  )
  sameIdSet(workspace.assetIds, assets.map((asset) => asset.id), `${label}.workspace.assetIds`)

  // `validateWorkspace` already proved every edge points at a node in the
  // graph; what it cannot know is whether a node's note came along too.
  const noteIds = new Set(notes.map((note) => note.id))
  for (const node of workspace.graph.nodes) {
    if (node.noteId !== undefined && !noteIds.has(node.noteId)) {
      broken(`graph node ${node.id} points at a note that is not in the file: ${node.noteId}`)
    }
  }

  return { workspace, notes, conversations, assets }
}

export function parseSnapshot(raw: unknown): Snapshot {
  const record = requireRecord(raw, 'snapshot')

  if (record.format !== SNAPSHOT_FORMAT) {
    throw new SnapshotError(
      'INVALID_FORMAT',
      `not a Nexora snapshot (format=${String(record.format)})`,
    )
  }

  const version = record.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SnapshotError('INVALID_FORMAT', `snapshot.version is invalid: ${String(version)}`)
  }
  if (version > SNAPSHOT_VERSION) {
    throw new SnapshotError(
      'UNSUPPORTED_VERSION',
      `snapshot version ${version} is newer than this build supports (${SNAPSHOT_VERSION})`,
    )
  }

  const envelope = {
    format: SNAPSHOT_FORMAT,
    version,
    dbVersion: typeof record.dbVersion === 'number' ? record.dbVersion : 0,
    exportedAt: requireString(record.exportedAt, 'snapshot.exportedAt'),
  } as const

  switch (record.kind) {
    case 'workspace': {
      const snapshot: WorkspaceSnapshot = {
        ...envelope,
        kind: 'workspace',
        bundle: parseBundle(record.bundle, 'bundle'),
      }
      return snapshot
    }
    case 'backup': {
      const bundles = requireArray(record.bundles, 'bundles').map((entry, index) =>
        parseBundle(entry, `bundles[${index}]`),
      )
      const ids = bundles.map((bundle) => bundle.workspace.id)
      if (new Set(ids).size !== ids.length) {
        broken('the backup holds two workspaces with the same id')
      }
      const snapshot: BackupSnapshot = { ...envelope, kind: 'backup', bundles }
      return snapshot
    }
    case 'note': {
      const note = requireRecord(record.note, 'note') as unknown as Note
      checked('note', () => validateNote(note))
      const snapshot: NoteSnapshot = { ...envelope, kind: 'note', note }
      return snapshot
    }
    default:
      throw new SnapshotError('INVALID_FORMAT', `unknown snapshot kind: ${String(record.kind)}`)
  }
}
