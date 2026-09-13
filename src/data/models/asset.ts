export type AssetType = 'image' | 'pdf' | 'video' | 'audio' | 'file'

export const ASSET_TYPES = [
  'image',
  'pdf',
  'video',
  'audio',
  'file',
] as const satisfies readonly AssetType[]

export interface AssetMetadata {
  createdAt: string
  updatedAt: string
}

/** Binary payload is stored as a Blob; IndexedDB keeps it structured-cloned. */
export interface Asset {
  id: string
  workspaceId: string
  name: string
  type: AssetType
  mimeType: string
  size: number
  data: Blob
  metadata: AssetMetadata
}

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && (ASSET_TYPES as readonly string[]).includes(value)
}
