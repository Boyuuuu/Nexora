# Nexora 数据层架构

> 基于当前代码库整理（IndexedDB `nexora-db` / schema v1）。  
> 本文覆盖：**实体结构、存储布局、Repository 接口、Operations 协议、Store 门面、导入导出**。

---

## 1. 总览

### 1.1 分层原则

```
UI Components
    ↓
knowledgeStore（唯一读模型 + 写入口门面）
    ├── Operations Engine  →  Block / Graph 编辑
    └── Repository         →  Workspace / Note 生命周期（及 Conversation / Asset）
            ↓
        IndexedDB（runTransaction）
```

硬性约定：

- **组件不得直接 import Repository / IndexedDB。**
- Block / Graph 的知识编辑只走 **Operations**（`store.run(operation)`）。
- Workspace / Note 的创建、重命名、删除、排序走 **Repository**（经 `knowledgeStore`）。
- Conversation / Asset 已有 Repository，但 **尚未接入 Workspace UI**（结构预留）。

### 1.2 嵌入 vs 独立存储

| 实体 | 存储方式 | 说明 |
|------|----------|------|
| Workspace | Object Store `workspaces` | 顶层容器 |
| Note | Object Store `notes` | 按 `workspaceId` 索引 |
| Block | **嵌入 Note.blocks[]** | 无独立 store |
| Graph（nodes/edges） | **嵌入 Workspace.graph** | 无独立 store；每个 Workspace 恰好一个 Graph |
| Conversation | Object Store `conversations` | 按 `workspaceId` 索引；消息嵌入 `messages[]` |
| Asset | Object Store `assets` | 按 `workspaceId` 索引；二进制为 `Blob` |

### 1.3 关系示意

```
Workspace
├── noteIds[] ──────────────► Note[]
│                               └── blocks[]  (Block 嵌入)
├── graph  (嵌入)
│     ├── nodes[]  (可选 noteId → Note)
│     └── edges[]  (source/target → Node.id)
├── conversationIds[] ──────► Conversation[]
│                               └── messages[]
└── assetIds[] ─────────────► Asset[]
```

---

## 2. IndexedDB 布局

| 项 | 值 |
|----|-----|
| 数据库名 | `nexora-db` |
| Schema 版本 | `1` |
| Object Stores | `workspaces`, `notes`, `conversations`, `assets` |
| 索引 | `notes` / `conversations` / `assets` 上的 `byWorkspaceId`（`workspaceId`，非唯一） |

连接管理（`src/data/db/database.ts`）：

- 全局缓存一个 `IDBDatabase` Promise。
- `onversionchange` / `onclose` 会清空缓存。
- `runTransaction` 在连接被浏览器关掉后，会 **重开并重试一次**（不丢库内数据）。

ID 生成（`createId(prefix)`）：

| 前缀 | 实体 |
|------|------|
| `ws_` | Workspace |
| `note_` | Note |
| `block_` | Block |
| `node_` | GraphNode |
| `edge_` | GraphEdge |
| `conv_` | Conversation |
| `msg_` | ConversationMessage |
| `asset_` | Asset |

时间戳均为 **ISO 字符串**（`nowIso()`）。

---

## 3. 领域模型（数据结构）

### 3.1 Workspace

```ts
interface Workspace {
  id: string
  sidebarOrder?: number          // 侧栏排序；旧数据可缺省
  metadata: {
    name: string
    description?: string
    createdAt: string
    updatedAt: string
  }
  noteIds: string[]              // 笔记顺序以此为准
  graph: Graph                   // 唯一嵌入图
  conversationIds: string[]
  assetIds: string[]
}
```

### 3.2 Note

```ts
interface Note {
  id: string
  workspaceId: string
  title: string
  blocks: Block[]                // 顺序即文档顺序
  metadata: { createdAt: string; updatedAt: string }
}
```

约束：不支持跨 Workspace 移动 Note（`update` 时若 `workspaceId` 变化会抛 `ConflictError`）。

### 3.3 Block（判别联合）

```ts
type BlockType =
  | 'text' | 'concept' | 'intuition'
  | 'math' | 'code' | 'example' | 'exploration'

type BlockSource = 'user' | 'ai' | 'import'   // ai 预留，尚未生产

interface TypedBlock<T extends BlockType> {
  id: string
  type: T
  data: BlockDataByType[T]
  metadata: {
    createdAt: string
    updatedAt: string
    source?: BlockSource
    tags?: string[]
  }
}
```

各类型 `data` 字段：

| type | data 字段 |
|------|-----------|
| `text` / `example` | `title?`, `content` |
| `concept` / `intuition` | `title`, `content` |
| `math` | `title?`, `latex`, `explanation?` |
| `code` | `title?`, `language`, `code` |
| `exploration` | `title?`, `items: string[]` |

`BLOCK_DATA_FIELDS` 与上述字段绑定，Operations 打补丁时不能写未知字段。

### 3.4 Graph

```ts
type GraphNodeType =
  | 'architecture' | 'mechanism' | 'component'
  | 'concept' | 'topic' | 'entity'

type GraphEdgeType =
  | 'contains' | 'uses' | 'relates' | 'depends_on' | 'explains'

interface GraphNode {
  id: string
  workspaceId: string
  label: string
  type: GraphNodeType
  noteId?: string                 // 可选关联 Note
  position?: { x: number; y: number }
  metadata?: Record<string, unknown>
}

interface GraphEdge {
  id: string
  workspaceId: string
  source: string                  // GraphNode.id
  target: string
  type: GraphEdgeType
  metadata?: Record<string, unknown>
}

interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

校验要点：

- Node / Edge 的 `workspaceId` 必须与所属 Workspace 一致。
- Edge 的 `source` / `target` 必须指向同图中的节点。
- `noteId` 若存在，Note 必须存在且属于同一 Workspace。
- 删除 Node 会级联删除触及它的 Edges。

### 3.5 Conversation（结构预留）

```ts
interface Conversation {
  id: string
  workspaceId: string
  title?: string
  messages: {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: string
  }[]
  metadata: { createdAt: string; updatedAt: string }
}
```

### 3.6 Asset（结构预留）

```ts
type AssetType = 'image' | 'pdf' | 'video' | 'audio' | 'file'

interface Asset {
  id: string
  workspaceId: string
  name: string
  type: AssetType
  mimeType: string
  size: number
  data: Blob                      // IndexedDB structured clone
  metadata: { createdAt: string; updatedAt: string }
}
```

---

## 4. 数据操作接口

### 4.1 对外该用谁？

| 场景 | 推荐入口 | 底层 |
|------|----------|------|
| UI 读当前工作区 / 笔记 / 图 | `useKnowledgeStore()` | Repository 只读 |
| UI 改 Block / Graph | `store.run(Operation)` | Operations → Repository |
| UI 建删改 Workspace / Note、排序 | `knowledgeStore` 生命周期方法 | Repository |
| 导入 / 导出备份 | `importSnapshot` / `export*Snapshot` | 多 store 单事务 |
| 测试 / 数据层直调 | 各 `*Repository`（Vue 组件禁止） | `runTransaction` |

---

## 5. Repository API

公共导出：`src/data/index.ts`。

### 5.1 `workspaceRepository`

| 方法 | 签名概要 | 行为 |
|------|----------|------|
| `createWorkspace` | `(name, description?) → Workspace` | 空图、空 id 列表 |
| `create` | `(workspace) → Workspace` | 校验后写入；冲突抛 `ConflictError` |
| `getById` | `(id) → Workspace \| undefined` | |
| `getAll` | `() → Workspace[]` | 按 `sidebarOrder` 排序 |
| `move` | `(id, targetId, after) → Workspace[]` | 重写全部 `sidebarOrder` |
| `moveNote` | `(workspaceId, noteId, targetId, after) → Workspace` | 重排 `noteIds` |
| `update` | `(workspace) → Workspace` | 保留 `createdAt`，刷新 `updatedAt` |
| `delete` | `(id) → void` | **级联删除** 该空间下全部 notes / conversations / assets |

### 5.2 `noteRepository`

| 方法 | 签名概要 | 行为 |
|------|----------|------|
| `createNote` / `create` | 创建并挂到 `workspace.noteIds` | 同事务 |
| `getById` | `(id) → Note \| undefined` | |
| `getByWorkspaceId` | `(workspaceId) → Note[]` | 索引查询（顺序以 Workspace.noteIds 为准） |
| `rename` | `(id, title) → Note` | 原子改标题 |
| `update` | `(note) → Note` | 禁止换 workspace |
| `delete` | `(id) → void` | 从 `noteIds` 移除；**断开** 图中指向该 Note 的 `noteId` |

### 5.3 `blockRepository`

Block 无独立 store；全部方法读写所属 Note。

| 方法 | 行为 |
|------|------|
| `createBlock(type, data, options?)` | 纯构造（不落库） |
| `getByNoteId` / `getById` | 读 |
| `add(noteId, block, index?)` | 插入（默认末尾） |
| `addAfter(noteId, block, after)` | 相对锚点插入：`string`=该块之后，`null`=开头，`undefined`=末尾 |
| `update(noteId, block)` | 整块替换（保留 createdAt） |
| `patch(noteId, blockId, { data?, metadata? })` | 合并补丁；不可改 id/type |
| `remove` / `move` / `moveAfter` | 删除 / 按索引或锚点重排 |

### 5.4 `graphRepository`

| 方法 | 行为 |
|------|------|
| `getGraph` / `getNodes` / `getEdges` | 读嵌入图 |
| `addNode` / `updateNode` / `removeNode` | 写节点；删节点返回级联删除的 edge ids |
| `moveNodes` | 批量改/清空 position（`null` 表示未放置） |
| `addEdge` / `removeEdge` | 写边 |

`updateNode` 的 `noteId` / `position` 传 `null` 表示清除该字段。

### 5.5 `conversationRepository`

| 方法 | 行为 |
|------|------|
| `createConversation` / `create` | 创建并挂到 `conversationIds` |
| `getById` / `getByWorkspaceId` | 读 |
| `update` | 整对象更新 |
| `appendMessage(id, role, content)` | 追加一条消息 |
| `delete` | 删除并更新 Workspace 引用 |
| `createMessage` | 纯构造 |

### 5.6 `assetRepository`

| 方法 | 行为 |
|------|------|
| `createAsset` / `create` | 创建并挂到 `assetIds` |
| `getById` / `getByWorkspaceId` | 读 |
| `update` / `delete` | 更新 / 删除并维护引用 |

### 5.7 数据层错误类型

| 类型 | 含义 |
|------|------|
| `ValidationError` | 形状 / 引用不合法 |
| `NotFoundError` | 目标不存在 |
| `ConflictError` | 重复 id、禁止的跨空间移动等 |
| `DatabaseError` | IndexedDB 打开 / 事务失败 |

---

## 6. Operations 协议（知识编辑的唯一写协议）

入口：`executeOperation(operation)` / `operationEngine.execute`；UI 经 `knowledgeStore.run`。

- 字段名 **snake_case**（面向未来 LLM 结构化输出）。
- 失败返回 `{ success: false, error: { code, message } }`，不抛到 UI。
- 成功返回 `affectedIds`（含级联影响的 id）。
- 一次 Operation ≈ **一次 Repository 写 ≈ 一次事务**。

### 6.1 操作一览

| operation | 作用域 | 要点 |
|-----------|--------|------|
| `create_block` | workspace + note | `block` 必带 id/type/data；`after_block_id?` |
| `delete_block` | | `block_id` |
| `update_block` | | `changes.data?` / `changes.metadata?`；不能改 id/type |
| `move_block` | | `after_block_id: string \| null` |
| `replace_block` | | 同 id 整块替换（可改 type）；AI 改类型时使用 |
| `create_node` | workspace | `node: { id, label, type, note_id?, position?, metadata? }` |
| `delete_node` | | 级联删边 |
| `update_node` | | `changes`；`note_id: null` 解绑笔记 |
| `move_node` | | 单节点 position |
| `move_nodes` | | 批量；`position: null` 清除坐标 |
| `create_edge` | | `edge: { id, source, target, type, metadata? }` |
| `delete_edge` | | `edge_id` |

### 6.2 示例

创建 block：

```json
{
  "operation": "create_block",
  "workspace_id": "ws_…",
  "note_id": "note_…",
  "block": {
    "id": "block_…",
    "type": "math",
    "data": { "latex": "E=mc^2", "explanation": "质能方程" },
    "metadata": { "source": "user" }
  },
  "after_block_id": null
}
```

更新节点并解绑笔记：

```json
{
  "operation": "update_node",
  "workspace_id": "ws_…",
  "node_id": "node_…",
  "changes": {
    "label": "Transformer",
    "note_id": null
  }
}
```

### 6.3 Operation 错误码

```
INVALID_OPERATION | TARGET_NOT_FOUND | PARENT_NOT_FOUND
DUPLICATE_ID | INVALID_REFERENCE
INVALID_BLOCK_TYPE | INVALID_BLOCK_DATA | INVALID_POSITION
OPERATION_FAILED
```

Repository 的 `NotFoundError` / `ConflictError` / `ValidationError` 会被映射进上述码。

### 6.4 刻意不在 Operations 里的事

- Workspace / Note 的 CRUD、侧栏排序  
- Conversation / Asset  
- Snapshot 导入导出（批量 I/O，走数据层单事务）

---

## 7. `knowledgeStore` 门面

文件：`src/stores/knowledgeStore.ts`。

### 7.1 响应式状态

| 字段 | 含义 |
|------|------|
| `workspaces` | 全部工作区列表 |
| `workspace` | 当前工作区（含 graph） |
| `notes` | 当前工作区笔记（按 `noteIds` 排序） |
| `note` | 当前笔记（含 blocks） |
| `graph` | `workspace.graph` 或空图 |
| `blocks` | `note.blocks` 或 `[]` |
| `busy` / `lastError` | 进行中 / 最近失败信息 |

### 7.2 方法

| 方法 | 职责 |
|------|------|
| `loadWorkspaces` | 启动加载列表 |
| `listWorkspaceNotes(id)` | 侧栏懒加载摘要（不切换当前选中） |
| `selectWorkspace` / `selectNote` | 切换当前上下文 |
| `reload` | 导入后整屏重读 |
| `run(operation)` | Operations 写路径 + 成功后刷新受影响分支 |
| `createWorkspace` / `renameWorkspace` / `deleteWorkspace` | 生命周期 |
| `createNote` / `renameNote` / `deleteNote` | 生命周期 |
| `moveWorkspace` / `moveWorkspaceNote` | 侧栏排序 |

写失败时：`guard` 捕获异常写入 `lastError` 并返回 `null`；`run` 则返回 `OperationResult`。

---

## 8. 导入 / 导出（Snapshot）

格式常量：`format: "nexora-snapshot"`，`version: 1`。

### 8.1 种类

| kind | 内容 |
|------|------|
| `workspace` | 单个 `WorkspaceBundle` |
| `backup` | 多个 bundle（全库备份） |
| `note` | 单条 Note（导入时需指定目标 workspace） |

`WorkspaceBundle`：`workspace` + `notes` + `conversations` + `assets`（asset.data 为 base64）。

### 8.2 导出 API

- `exportWorkspaceSnapshot(workspaceId)`
- `exportBackupSnapshot()`
- `exportNoteSnapshot(noteId)`
- `snapshotToJson` / `snapshotToBlob` / `readSnapshotBlob`

### 8.3 导入 API

```ts
importSnapshot(snapshot, {
  mode: 'restore' | 'copy',  // restore 保留 id；copy 重映射新 id
  overwrite?: boolean,       // restore 时是否覆盖已存在 workspace
  workspaceId?: string,      // note 快照的目标工作区
}): Promise<ImportSummary>
```

导入在 **四 store 单事务** 中完成，失败则整库该事务回滚。

---

## 9. 级联与一致性规则（速查）

| 动作 | 副作用 |
|------|--------|
| 删除 Workspace | 删除其全部 Notes / Conversations / Assets（图随 Workspace 记录消失） |
| 删除 Note | 从 `noteIds` 移除；图节点若 `noteId` 指向它则 **解绑**（节点保留） |
| 删除 GraphNode | 删除所有相关 Edges |
| 创建 Note / Conv / Asset | 同步追加到 Workspace 对应 id 列表 |
| Block 任意写 | 只改 Note 文档；不自动改图 |

---

## 10. 关键源文件索引

| 路径 | 内容 |
|------|------|
| `src/data/models/*` | 领域类型 |
| `src/data/db/schema.ts` / `database.ts` | 库结构与事务 |
| `src/data/repositories/*` | CRUD 与嵌入结构写入 |
| `src/data/validation.ts` | 形状与引用校验 |
| `src/data/transfer/*` | Snapshot 导入导出 |
| `src/operations/types.ts` | Operation 协议 |
| `src/operations/engine.ts` | 分发与结果封装 |
| `src/operations/handlers/*` | Block / Graph handlers |
| `src/stores/knowledgeStore.ts` | UI 唯一数据门面 |
| `src/data/index.ts` / `src/operations/index.ts` | 公共导出面 |

---

## 11. 当前阶段边界（实现状态）

| 能力 | 状态 |
|------|------|
| Workspace / Note / Block / Graph | 已接入 Workspace UI |
| Operations（Block + Graph） | 已接入 |
| Conversation / Asset 模型与 Repository | 已实现，UI 未接 |
| Snapshot 导入导出 | 已实现（侧栏转移对话框） |
| 多端同步 / 服务端 | 无（纯本机 IndexedDB） |
| AI 写回 Conversation / `source: 'ai'` | 协议预留；Edit 写入可标 `source: 'ai'` |
| AI Skill `note-edit`（单篇编辑） | 已接入：结构化通道强制 JSON Plan/Patch → 预览确认；见 [ai-note-edit-skill.md](./ai-note-edit-skill.md) |
| AI Skill `graph-expand` | 未做 |

本文随代码演进；若模型或 Operation 集合变更，请同步更新本节与第 3、6 章。
