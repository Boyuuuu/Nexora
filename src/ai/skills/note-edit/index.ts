import { MAX_EDIT_BLOCKS } from '../../protocol'
import type { AiSkill } from '../types'
import { NOTE_EDIT_PATCH_PROMPT, NOTE_EDIT_PLAN_PROMPT } from './prompts'

/** Single-note edit skill — model decides flexibly; structured provider enforces JSON schema. */
export const noteEditSkill: AiSkill = {
  id: 'note-edit',
  version: '3.0.0',
  title: '单篇笔记编辑',
  description:
    '模型灵活规划并生成 block 改动；通过支持 JSON Schema 的结构化通道强制合法 JSON，直答仅作可选辅助。',
  limits: {
    maxEditBlocks: MAX_EDIT_BLOCKS,
    allowRewrite: true,
  },
  prompts: {
    plan: NOTE_EDIT_PLAN_PROMPT,
    patch: NOTE_EDIT_PATCH_PROMPT,
  },
}

export { NOTE_EDIT_PATCH_PROMPT, NOTE_EDIT_PLAN_PROMPT } from './prompts'
