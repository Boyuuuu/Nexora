import { noteEditSkill } from './note-edit'
import type { AiSkill } from './types'

const skills: Record<string, AiSkill> = {
  [noteEditSkill.id]: noteEditSkill,
}

/** Default skill for the right-hand AI editor panel. */
export const DEFAULT_AI_SKILL_ID = noteEditSkill.id

export function getAiSkill(id: string = DEFAULT_AI_SKILL_ID): AiSkill {
  return skills[id] ?? noteEditSkill
}

export function listAiSkills(): AiSkill[] {
  return Object.values(skills)
}

export type { AiSkill, AiSkillLimits, AiSkillPrompts } from './types'
export { noteEditSkill }
