/**
 * Product skills for Nexora AI.
 * Skills are static instruction packs loaded in the browser — no backend required.
 */

export interface AiSkillPrompts {
  /** Planning guidance (shape enforced by structured JSON Schema). */
  plan: string
  /** Patch guidance (shape enforced by structured JSON Schema). */
  patch: string
}

export interface AiSkillLimits {
  /** Max blocks touched in normal edit mode. */
  maxEditBlocks: number
  /** Whether rewrite mode may exceed maxEditBlocks. */
  allowRewrite: boolean
}

export interface AiSkill {
  id: string
  version: string
  title: string
  /** When this skill should be used (product language). */
  description: string
  limits: AiSkillLimits
  prompts: AiSkillPrompts
}
