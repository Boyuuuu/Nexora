import { MAX_EDIT_BLOCKS } from './protocol'

/**
 * JSON Schemas for the structured provider (OpenAI-compatible json_schema).
 * Keep shapes strict-friendly: additionalProperties false, required lists complete.
 * Semantic validation (real block ids / types) still happens in parseEdit*.
 */

const nullableString = { type: ['string', 'null'] } as const

const targetItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['update', 'replace', 'create', 'delete', 'move'] },
    block_id: nullableString,
    after_block_id: nullableString,
    type: nullableString,
    intent: { type: 'string' },
    selected: { type: 'boolean' },
  },
  required: ['action', 'block_id', 'after_block_id', 'type', 'intent', 'selected'],
} as const

const patchDataSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
    latex: { type: 'string' },
    explanation: { type: 'string' },
    language: { type: 'string' },
    code: { type: 'string' },
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'content', 'latex', 'explanation', 'language', 'code', 'items'],
} as const

export const EDIT_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['edit', 'rewrite'] },
    summary: { type: 'string' },
    targets: {
      type: 'array',
      maxItems: 32,
      items: targetItemSchema,
    },
  },
  required: ['mode', 'summary', 'targets'],
} as const

export const EDIT_PATCH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    patches: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['update', 'replace', 'create', 'delete', 'move'] },
          block_id: nullableString,
          after_block_id: nullableString,
          type: nullableString,
          intent: { type: 'string' },
          data: { anyOf: [patchDataSchema, { type: 'null' }] },
        },
        required: ['action', 'block_id', 'after_block_id', 'type', 'intent', 'data'],
      },
    },
  },
  required: ['patches'],
} as const

export type StructuredSchemaName = 'edit_plan' | 'edit_patch'

export function structuredSchema(name: StructuredSchemaName) {
  if (name === 'edit_plan') {
    return {
      name: 'edit_plan',
      strict: true as const,
      schema: EDIT_PLAN_JSON_SCHEMA,
      description: `Plan block edits for the current note. In edit mode prefer at most ${MAX_EDIT_BLOCKS} targets.`,
    }
  }
  return {
    name: 'edit_patch',
    strict: true as const,
    schema: EDIT_PATCH_JSON_SCHEMA,
    description: 'Concrete patches for selected plan targets only. Unused data fields may be empty strings.',
  }
}
