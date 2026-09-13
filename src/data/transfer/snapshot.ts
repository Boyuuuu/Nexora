/**
 * Snapshot format for exporting and re-importing knowledge data.
 *
 * A snapshot is bulk I/O, not an edit, so it deliberately does not go through
 * the Operations layer: replaying a whole workspace as hundreds of Operations
 * would mean hundreds of transactions and no way to fail cleanly. Reading and
 * writing snapshots lives in the data layer instead, where a single
 * transaction can cover every store at once.
 */

import { DB_VERSION } from '../db/schema'
import type { Asset } from '../models/asset'
import type { Conversation } from '../models/conversation'
import type { Note } from '../models/note'
import type { Workspace } from '../models/workspace'
import { nowIso } from '../utils/time'

export const SNAPSHOT_FORMAT = 'nexora-snapshot'

/**
 * Bump when the file layout changes. A reader refuses anything newer than it
 * understands rather than importing a partially recognised file.
 */
export const SNAPSHOT_VERSION = 1

export type SnapshotErrorCode =
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_SNAPSHOT'
  | 'BROKEN_REFERENCE'
  | 'IMPORT_CONFLICT'
  | 'MISSING_TARGET'

export class SnapshotError extends Error {
  override name = 'SnapshotError'
  readonly code: SnapshotErrorCode

  constructor(code: SnapshotErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Asset payloads travel as base64 because JSON cannot hold a Blob. */
export interface AssetSnapshot extends Omit<Asset, 'data'> {
  data: string
}

/** One workspace with everything that belongs to it. */
export interface WorkspaceBundle {
  workspace: Workspace
  notes: Note[]
  conversations: Conversation[]
  assets: AssetSnapshot[]
}

export interface SnapshotEnvelope {
  format: typeof SNAPSHOT_FORMAT
  version: number
  /** IndexedDB schema version the file was written from. */
  dbVersion: number
  exportedAt: string
}

export interface WorkspaceSnapshot extends SnapshotEnvelope {
  kind: 'workspace'
  bundle: WorkspaceBundle
}

export interface BackupSnapshot extends SnapshotEnvelope {
  kind: 'backup'
  bundles: WorkspaceBundle[]
}

/** A single note travels without its workspace; the importer picks a target. */
export interface NoteSnapshot extends SnapshotEnvelope {
  kind: 'note'
  note: Note
}

export type Snapshot = WorkspaceSnapshot | BackupSnapshot | NoteSnapshot

export function createEnvelope(): SnapshotEnvelope {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    dbVersion: DB_VERSION,
    exportedAt: nowIso(),
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // Chunked so a large asset cannot blow the argument limit of `fromCharCode`.
  const chunk = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    throw new SnapshotError('INVALID_SNAPSHOT', 'asset.data is not valid base64')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

export interface SnapshotSummary {
  kind: Snapshot['kind']
  workspaces: number
  notes: number
  blocks: number
  nodes: number
  edges: number
  conversations: number
  assets: number
}

/** Counts what a file holds, for an import preview or a test assertion. */
export function describeSnapshot(snapshot: Snapshot): SnapshotSummary {
  const summary: SnapshotSummary = {
    kind: snapshot.kind,
    workspaces: 0,
    notes: 0,
    blocks: 0,
    nodes: 0,
    edges: 0,
    conversations: 0,
    assets: 0,
  }

  if (snapshot.kind === 'note') {
    summary.notes = 1
    summary.blocks = snapshot.note.blocks.length
    return summary
  }

  const bundles = snapshot.kind === 'workspace' ? [snapshot.bundle] : snapshot.bundles
  for (const bundle of bundles) {
    summary.workspaces += 1
    summary.notes += bundle.notes.length
    summary.blocks += bundle.notes.reduce((total, note) => total + note.blocks.length, 0)
    summary.nodes += bundle.workspace.graph.nodes.length
    summary.edges += bundle.workspace.graph.edges.length
    summary.conversations += bundle.conversations.length
    summary.assets += bundle.assets.length
  }
  return summary
}

function slug(value: string): string {
  const cleaned = value.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'workspace' : cleaned.slice(0, 40)
}

export function snapshotFilename(snapshot: Snapshot): string {
  const stamp = snapshot.exportedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 17)
  const label =
    snapshot.kind === 'workspace'
      ? slug(snapshot.bundle.workspace.metadata.name)
      : snapshot.kind === 'note'
        ? slug(snapshot.note.title)
        : 'backup'
  return `nexora-${snapshot.kind}-${label}-${stamp}.json`
}
