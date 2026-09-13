import { ConflictError, NotFoundError, ValidationError } from '../data'
import type { Operation } from './types'

export const OPERATION_ERROR_CODES = [
  'INVALID_OPERATION',
  'TARGET_NOT_FOUND',
  'PARENT_NOT_FOUND',
  'DUPLICATE_ID',
  'INVALID_REFERENCE',
  'INVALID_BLOCK_TYPE',
  'INVALID_BLOCK_DATA',
  'INVALID_POSITION',
  'OPERATION_FAILED',
] as const

export type OperationErrorCode = (typeof OPERATION_ERROR_CODES)[number]

export class OperationError extends Error {
  override name = 'OperationError'
  readonly code: OperationErrorCode
  readonly operation: Operation

  constructor(code: OperationErrorCode, message: string, operation: Operation) {
    super(message)
    this.code = code
    this.operation = operation
  }
}

export function fail(
  code: OperationErrorCode,
  message: string,
  operation: Operation,
): never {
  throw new OperationError(code, message, operation)
}

/**
 * Repository failures speak the data layer's vocabulary, and they are a
 * backstop rather than the main path: the engine validates first, so anything
 * arriving here is an invariant the pre-checks did not anticipate.
 */
export function toOperationError(error: unknown, operation: Operation): OperationError {
  if (error instanceof OperationError) {
    return error
  }
  if (error instanceof NotFoundError) {
    return new OperationError('TARGET_NOT_FOUND', error.message, operation)
  }
  if (error instanceof ConflictError) {
    return new OperationError('DUPLICATE_ID', error.message, operation)
  }
  if (error instanceof ValidationError) {
    return new OperationError(
      'OPERATION_FAILED',
      `rejected by the data layer: ${error.message}`,
      operation,
    )
  }
  return new OperationError(
    'OPERATION_FAILED',
    error instanceof Error ? error.message : String(error),
    operation,
  )
}
