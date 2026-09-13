import type { Block, BlockType, GraphEdgeType, GraphNodePosition, GraphNodeType } from '../data'
import { createId } from '../data'
import type { BlockChanges, Operation, OperationResult } from '../operations'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { defaultBlockInput, duplicateBlockInput } from '../workspace/blockDefaults'
import { blockTitle, nodeTypeFromBlock } from '../workspace/labels'
import { friendlyOperationError, logOperationFailure } from '../workspace/operationErrors'
import { useWorkspaceUi } from './useWorkspaceUi'

export function useWorkspaceActions() {
  const store = useKnowledgeStore()
  const ui = useWorkspaceUi()

  function workspaceId(): string | null {
    return store.workspace.value?.id ?? null
  }

  function noteId(): string | null {
    return store.note.value?.id ?? null
  }

  async function run(operation: Operation, friendly?: string): Promise<OperationResult> {
    const result = await store.run(operation)
    if (!result.success) {
      logOperationFailure(operation.operation, result.error?.code, result.error?.message)
      ui.showToast(friendly ?? friendlyOperationError(operation.operation))
    }
    return result
  }

  async function failGuard<T>(work: () => Promise<T | null>, friendly: string): Promise<T | null> {
    const value = await work()
    if (value === null && store.lastError.value) {
      if (import.meta.env.DEV) {
        console.warn('[nexora:store]', store.lastError.value)
      }
      ui.showToast(friendly)
    }
    return value
  }

  async function openNote(id: string): Promise<void> {
    await store.selectNote(id)
    ui.touchRecent(id)
    ui.setMode('note')
    ui.selectBlock(null)
  }

  async function openCanvas(nodeId?: string): Promise<void> {
    ui.setMode('canvas')
    if (nodeId) {
      ui.requestFocusNode(nodeId)
      ui.selectNode(nodeId)
    }
  }

  return {
    store,
    ui,

    async bootstrap(): Promise<void> {
      await store.loadWorkspaces()
    },

    async selectWorkspace(id: string): Promise<void> {
      await store.selectWorkspace(id)
      const first = store.notes.value[0]
      if (first) {
        await openNote(first.id)
      } else {
        await store.selectNote(null)
        ui.setMode('note')
      }
    },

    openNote,
    openCanvas,

    async createNote(): Promise<void> {
      const id = workspaceId()
      if (!id) return
      const created = await failGuard(
        () => store.createNote(id, 'Untitled'),
        'Could not create a note.\nPlease try again.',
      )
      if (created) {
        ui.touchRecent(created.id)
        ui.setMode('note')
        ui.selectBlock(null)
      }
    },

    async renameNote(id: string, title: string): Promise<void> {
      const trimmed = title.trim()
      if (!trimmed) return
      await failGuard(
        async () => {
          await store.renameNote(id, trimmed)
          return true
        },
        'Could not rename this note.\nPlease try again.',
      )
    },

    async deleteNote(id: string): Promise<void> {
      const ok = await ui.confirm({
        title: 'Delete this note?',
        message: 'The note and its blocks will be removed. Related nodes stay, but lose this link.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
      await failGuard(
        async () => {
          await store.deleteNote(id)
          return true
        },
        'Could not delete this note.\nPlease try again.',
      )
      const next = store.notes.value[0]
      if (next) await openNote(next.id)
    },

    async createBlock(type: BlockType): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      const id = createId('block')
      const result = await run({
        operation: 'create_block',
        workspace_id: ws,
        note_id: note,
        block: defaultBlockInput(id, type),
      })
      if (result.success) ui.selectBlock(id)
    },

    async updateBlock(blockId: string, changes: BlockChanges): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      await run({
        operation: 'update_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
        changes,
      })
    },

    async duplicateBlock(block: Block): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      const id = createId('block')
      await run({
        operation: 'create_block',
        workspace_id: ws,
        note_id: note,
        block: duplicateBlockInput(id, block),
        after_block_id: block.id,
      })
    },

    async deleteBlock(blockId: string): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      const ok = await ui.confirm({
        title: 'Delete this block?',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
      const result = await run({
        operation: 'delete_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
      })
      if (result.success && ui.selectedBlockId.value === blockId) {
        ui.selectBlock(null)
      }
    },

    async moveBlock(blockId: string, afterBlockId: string | null): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      await run({
        operation: 'move_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
        after_block_id: afterBlockId,
      })
    },

    async moveBlockByDirection(blockId: string, direction: 'up' | 'down'): Promise<void> {
      const blocks = store.blocks.value
      const index = blocks.findIndex((block) => block.id === blockId)
      if (index === -1) return
      let after: string | null | undefined
      if (direction === 'up') {
        if (index === 0) return
        after = index === 1 ? null : (blocks[index - 2]?.id ?? null)
      } else {
        const next = blocks[index + 1]
        if (!next) return
        after = next.id
      }
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      await run({
        operation: 'move_block',
        workspace_id: ws,
        note_id: note,
        block_id: blockId,
        after_block_id: after,
      })
    },

    async dropBlockBefore(draggedId: string, targetId: string): Promise<void> {
      if (draggedId === targetId) return
      const remaining = store.blocks.value.filter((block) => block.id !== draggedId)
      const index = remaining.findIndex((block) => block.id === targetId)
      if (index === -1) return
      const after = index === 0 ? null : (remaining[index - 1]?.id ?? null)
      const ws = workspaceId()
      const note = noteId()
      if (!ws || !note) return
      await run({
        operation: 'move_block',
        workspace_id: ws,
        note_id: note,
        block_id: draggedId,
        after_block_id: after,
      })
    },

    async convertBlockToNode(block: Block): Promise<void> {
      const ws = workspaceId()
      const note = noteId()
      if (!ws) return
      const result = await run({
        operation: 'create_node',
        workspace_id: ws,
        node: {
          id: createId('node'),
          label: blockTitle(block),
          type: nodeTypeFromBlock(block.type),
          ...(note ? { note_id: note } : {}),
          position: { x: 120 + Math.random() * 80, y: 120 + Math.random() * 80 },
        },
      })
      if (result.success) {
        ui.showToast('Created a knowledge node from this block.')
      }
    },

    askAiAboutBlock(block: Block, prompt: string): void {
      ui.selectBlock(block.id)
      ui.inspectOpen.value = false
      ui.openAiPanel()
      ui.aiDraft.value = prompt
      ui.pushAiMessage('user', prompt)
      ui.pushAiMessage(
        'assistant',
        'AI connection is not configured yet.\nThis panel is the future exploration entrance — your question and the current context are ready for a model.',
      )
      ui.aiDraft.value = ''
    },

    async createNode(label: string, type: GraphNodeType, position?: GraphNodePosition): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      const id = createId('node')
      const result = await run({
        operation: 'create_node',
        workspace_id: ws,
        node: {
          id,
          label: label.trim() || 'Untitled',
          type,
          position: position ?? { x: 160, y: 120 },
        },
      })
      if (result.success) ui.selectNode(id)
    },

    async moveNode(nodeId: string, position: GraphNodePosition): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      await run({
        operation: 'move_node',
        workspace_id: ws,
        node_id: nodeId,
        position,
      })
    },

    async updateNode(
      nodeId: string,
      changes: { label?: string; type?: GraphNodeType; note_id?: string | null },
    ): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      await run({
        operation: 'update_node',
        workspace_id: ws,
        node_id: nodeId,
        changes,
      })
    },

    async deleteNode(nodeId: string): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      const ok = await ui.confirm({
        title: 'Delete this node?',
        message: 'Connected relationships will be removed automatically.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return
      const result = await run({
        operation: 'delete_node',
        workspace_id: ws,
        node_id: nodeId,
      })
      if (result.success) ui.selectNode(null)
    },

    async createEdge(source: string, target: string, type: GraphEdgeType): Promise<void> {
      const ws = workspaceId()
      if (!ws || source === target) return
      await run({
        operation: 'create_edge',
        workspace_id: ws,
        edge: {
          id: createId('edge'),
          source,
          target,
          type,
        },
      })
    },

    async deleteEdge(edgeId: string): Promise<void> {
      const ws = workspaceId()
      if (!ws) return
      const result = await run({
        operation: 'delete_edge',
        workspace_id: ws,
        edge_id: edgeId,
      })
      if (result.success) ui.selectEdge(null)
    },

    sendAiPlaceholder(text: string): void {
      const trimmed = text.trim()
      if (!trimmed) return
      ui.pushAiMessage('user', trimmed)
      ui.pushAiMessage(
        'assistant',
        'AI connection is not configured yet.\nThis panel is the future exploration entrance — your question and the current context are ready for a model.',
      )
      ui.aiDraft.value = ''
    },
  }
}
