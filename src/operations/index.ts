/**
 * Nexora Operations Layer — public surface.
 *
 * UI code (and, in the next stage, LLM structured output) reaches the data
 * layer only through `operationEngine`. Nothing here exposes a repository.
 */

export { executeOperation, operationEngine } from './engine'

export { OPERATION_ERROR_CODES, OperationError } from './errors'
export type { OperationErrorCode } from './errors'

export { isOperationType, OPERATION_TYPES } from './types'
export type {
  BlockAnchorId,
  BlockChanges,
  BlockInput,
  BlockMetadataInput,
  BlockOperation,
  CreateBlockOperation,
  CreateEdgeOperation,
  CreateNodeOperation,
  DeleteBlockOperation,
  DeleteEdgeOperation,
  DeleteNodeOperation,
  EdgeInput,
  GraphOperation,
  MoveBlockOperation,
  MoveNodeOperation,
  NodeChanges,
  NodeInput,
  Operation,
  OperationResult,
  OperationType,
  UpdateBlockOperation,
  UpdateNodeOperation,
} from './types'
