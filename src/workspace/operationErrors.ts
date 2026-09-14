import type { OperationType } from '../operations'

const FRIENDLY: Partial<Record<OperationType, string>> = {
  create_block: 'Could not add this block.\nPlease try again.',
  update_block: 'Could not save this block.\nPlease try again.',
  replace_block: 'Could not convert this block.\nPlease try again.',
  delete_block: 'Could not delete this block.\nPlease try again.',
  move_block: 'Could not move this block.\nPlease try again.',
  create_node: 'Could not create this node.\nPlease try again.',
  update_node: 'Could not update this node.\nPlease try again.',
  move_node: 'Could not move this node.\nPlease try again.',
  delete_node: 'Could not delete this node.\nPlease try again.',
  create_edge: 'Could not create this relationship.\nPlease try again.',
  delete_edge: 'Could not delete this relationship.\nPlease try again.',
}

export function friendlyOperationError(type: OperationType): string {
  return FRIENDLY[type] ?? 'Something went wrong.\nPlease try again.'
}

export function logOperationFailure(
  operation: string,
  code: string | undefined,
  message: string | undefined,
): void {
  if (import.meta.env.DEV) {
    console.warn('[nexora:operation]', { operation, code, message })
  }
}
