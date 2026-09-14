# Nexora AI Skill：`note-edit`（单篇笔记编辑）

> 纯前端静态包。  
> **v3：模型灵活决策 + 结构化通道强制合法 JSON。** 直答不再承担 Plan/Patch。

---

## 1. 架构

```
用户指令 + 引用
        ↓
 结构化模型（OpenAI 兼容）
   response_format: json_schema（失败则降级 json_object）
        ↓
 parseEditPlan / parseEditPatches（语义校验：真实 block_id、type、data）
        ↓
 用户勾选 / 预览 → Operations → IndexedDB
```

| 通道 | 用途 |
|------|------|
| **结构化模型** | Plan / Patch（强制 JSON） |
| 知乎站内搜索 | 编辑前取景：把相关问答/文章摘要注入上下文（可关） |
| 知乎直答 | 可选保留（流式思考 / 自由问答，当前主链路不依赖） |

---

## 2. 配置

设置面板 →「结构化模型」：

- API Key
- 模型 ID（如 `gpt-4o-mini`）
- 接口地址（开发默认 `/openai`）
- 强制格式：`json_schema`（推荐）或 `json_object`

环境变量（可选）：

- `VITE_STRUCTURED_API_KEY`
- `VITE_STRUCTURED_MODEL`
- `VITE_STRUCTURED_BASE_URL`
- `VITE_OPENAI_PROXY_TARGET`（Vite 把 `/openai` 代理到该 origin，默认 `https://api.openai.com`）

换 DeepSeek / Moonshot 等：把 baseUrl / proxy target 指到对应 OpenAI 兼容网关即可。

---

## 3. Schema

源码：[`src/ai/schemas.ts`](../src/ai/schemas.ts)

- `edit_plan` → `mode` / `summary` / `targets[]`
- `edit_patch` → `patches[]`（含统一 `data` 字段；用不到的填空串）

应用层仍用 [`parseEditPlan`](../src/ai/protocol.ts) / `parseEditPatches` 校验真实 `block_id` 与类型载荷。

### 知乎搜索取景

- 客户端：[`src/ai/zhihuSearch.ts`](../src/ai/zhihuSearch.ts)
- `GET /api/v1/content/zhihu_search?Query=&Count=`（开发经 `/zhida` 代理）
- 设置项「编辑时启用知乎站内搜索」；失败不阻断编辑
- 结果以短摘要进入 prompt，并在右侧面板展示链接

---

## 4. Skill 文件

```
src/ai/
  schemas.ts
  structuredClient.ts
  providerSettings.ts
  skills/note-edit/prompts.ts   # plan / patch 指导语（形状由 schema 强制）
```

版本：`note-edit@3.0.0`

---

## 5. 与数据层对齐

- Workspace 手工创建；Skill 不碰 Workspace CRUD  
- 落盘仍是 Operations（`create/update/replace/delete/move_block`）  
- 本 Skill 不写 Graph  

详见 [data-layer.md](./data-layer.md)。
