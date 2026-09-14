/**
 * The Operation Engine — the single entry point for changing knowledge data.
 *
 *   Operation → Engine → Validation → Repository → IndexedDB
 *
 * It never touches IndexedDB itself: each operation resolves to exactly one
 * repository write, which is one transaction, which is what makes an operation
 * all-or-nothing.
 */

import { OperationError, toOperationError } from './errors'
import {
  handleCreateBlock,
  handleDeleteBlock,
  handleMoveBlock,
  handleReplaceBlock,
  handleUpdateBlock,
} from './handlers/blockHandlers'
import {
  handleCreateEdge,
  handleCreateNode,
  handleDeleteEdge,
  handleDeleteNode,
  handleMoveNode,
  handleMoveNodes,
  handleUpdateNode,
} from './handlers/graphHandlers'
import { isOperationType, type Operation, type OperationResult } from './types'

function dispatch(operation: Operation): Promise<string[]> {
  switch (operation.operation) {
    case 'create_block':
      return handleCreateBlock(operation)
    case 'delete_block':
      return handleDeleteBlock(operation)
    case 'update_block':
      return handleUpdateBlock(operation)
    case 'replace_block':
      return handleReplaceBlock(operation)
    case 'move_block':
      return handleMoveBlock(operation)
    case 'create_node':
      return handleCreateNode(operation)
    case 'delete_node':
      return handleDeleteNode(operation)
    case 'update_node':
      return handleUpdateNode(operation)
    case 'move_node':
      return handleMoveNode(operation)
    case 'move_nodes':
      return handleMoveNodes(operation)
    case 'create_edge':
      return handleCreateEdge(operation)
    case 'delete_edge':
      return handleDeleteEdge(operation)
  }
}

/**
 * Runs one operation. Failures come back as a result rather than an exception,
 * because the caller (a test today, an LLM-driven UI later) needs the error
 * code as data.
 */
export async function executeOperation(operation: Operation): Promise<OperationResult> {
  try {
    // The static union cannot vouch for JSON that arrived at runtime.
    if (typeof operation !== 'object' || operation === null) {
      throw new OperationError('INVALID_OPERATION', 'operation must be an object', operation)
    }
    if (!isOperationType(operation.operation)) {
      throw new OperationError(
        'INVALID_OPERATION',
        `Unknown operation: ${String(operation.operation)}`,
        operation,
      )
    }

    return { success: true, operation, affectedIds: await dispatch(operation) }
  } catch (error) {
    const failure = toOperationError(error, operation)
    return {
      success: false,
      operation,
      affectedIds: [],
      error: { code: failure.code, message: failure.message },
    }
  }
}

export const operationEngine = {
  execute: executeOperation,
}
