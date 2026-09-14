# note-edit

单篇笔记编辑 Skill（Nexora 产品内，非 Cursor Skill）。

- **何时用：** 用户在右侧 AI 面板要求改写、解释、纠错、补例子、调结构；或引用了 Note 内文字。
- **不做什么：** 不创建 Workspace；不读其他 Note 正文；不改 Graph。
- **流程：** 结构化模型（JSON Schema）输出 Plan → 用户勾选 → Patch JSON → 预览确认 → Operations。
- **约束方式：** API `response_format` 强制合法 JSON；应用再做语义校验。
- **提示词：** [prompts.ts](./prompts.ts)
- **说明：** [docs/ai-note-edit-skill.md](../../../docs/ai-note-edit-skill.md)
