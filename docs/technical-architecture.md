# Coco 技术架构文档

> 版本：v0.6
> 状态：MVP 架构设计完成（Agent 组装层 / 执行引擎 / Event Bus / Skill / Provider / Memory / Tool / 目录结构）

---

## 一、技术选型（已确定）

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | Electron | 纯客户端，Claude Desktop 同方案 |
| 前端 | Vite + React + Zustand + Tailwind + shadcn/ui | TypeScript，Zustand 按领域拆分 store，Magic UI 按需补充 AI 动效 |
| 模型调用 | Vercel AI SDK | 多模型统一适配，OpenCode 验证过 |
| Agent 引擎 | 自研 | 循环 + 工具 + 调度 + 规范注入 + 记忆，参考 OpenCode |
| 数据库 | SQLite（better-sqlite3） | 纯本地 |
| 语言 | TypeScript 全栈 | |

### 选型决策记录

| 方案 | 结论 | 理由 |
|---|---|---|
| Tauri + Python | 否决 | AI 生态强但三语言维护成本高 |
| Tauri + Node Sidecar | 否决 | Node 做 Agent 后 Rust 层无意义 |
| Electron | **采纳** | 全栈 JS，架构最简单，完全可控 |
| Fork OpenCode | 否决 | 架构耦合，不支持多 Agent 编排，带大量无用模块 |
| LangChain.js | 否决 | 过度封装，Agent 编排是产品核心不能依赖框架 |
| 原生 SDK 自写适配层 | 否决 | 多厂商维护成本高，Vercel AI SDK 已解决 |
| Vercel AI SDK | **采纳** | 20+ 厂商适配，OpenCode 116k star 验证 |
| TanStack Query | 否决 | IPC 是本地调用（1ms 级），缓存/去重/后台刷新等能力无实际收益；Streaming 仍需额外方案，导致两套状态管理范式 |
| Zustand | **采纳** | 一套范式统一管理 Streaming + CRUD + 跨视图状态，按领域拆分 store 实现视图级隔离 |

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│  Renderer（React UI）                                │
└────────────────────┬────────────────────────────────┘
                     │ IPC
┌────────────────────▼────────────────────────────────┐
│  IPC 层                                              │
├──────────────────────────────────────────────────────┤
│  Service 层                                          │
│  ├── ConversationService（对话模式入口）               │
│  ├── ProviderService / AgentService / SettingsService │
│  ├── ProjectService + Orchestrator —— 二期            │
│  └── ArtifactService —— 二期                         │
├──────────────────────────────────────────────────────┤
│  Orchestrator（工作流编排）—— 二期                     │
│  ├── 工作流状态机                                     │
│  ├── 门禁管理（暂停/恢复/人工确认）                    │
│  ├── 多 AgentEngine 调度                             │
│  └── Agent 间数据流（summary + artifacts）            │
├──────────────────────────────────────────────────────┤
│  AgentEngine（单 Agent 执行引擎）                     │
│  ├── 对话模式（MVP）：交互式，需确认                   │
│  ├── 任务模式（二期）：自主式，预授权                   │
│  ├── ModelContextBuilder（每轮重建，缓存友好）         │
│  ├── EventEmitter<EngineEvent>                       │
│  └── UsageTracker                                    │
├──────────────────────────────────────────────────────┤
│  ToolRegistry（MCP 兼容接口）                         │
│  ├── 内置工具（File/Bash/WebFetch）                  │
│  ├── 产物工具 —— 二期                                │
│  ├── SkillEngine —— 二期                             │
│  └── 外部 MCP Server 接入 —— 二期                    │
├──────────────────────────────────────────────────────┤
│  Provider 层（Vercel AI SDK + ModelProfile）          │
├──────────────────────────────────────────────────────┤
│  Data 层（SQLite + SecureStore）                     │
└──────────────────────────────────────────────────────┘
```

依赖方向：上层依赖下层，下层不知道上层存在。

---

## 三、MVP 架构详细设计

### 3.1 Main 进程分层

```
IPC 层        ← 接收前端请求，推送事件
Service 层    ← 业务编排（保存消息、查配置、权限检查）
Core 层       ← 引擎逻辑（执行循环、工具调用、prompt 拼接）
Provider 层   ← 模型调用（Vercel AI SDK）
Data 层       ← 数据持久化（SQLite + SecureStore）
```

### 3.2 AgentEngine（对话模式）

AgentEngine 接收 Assembly 层组装好的 TurnContext（见 3.18），执行模型调用 + 工具循环。

```
AgentEngine.run(turnContext, agentRuntime, conversation, message)
│
├── 0. 初始化
│   ├── 创建 AbortController（本轮唯一，signal 贯穿所有异步操作）
│   └── 初始化 turnUsage 累加器（prompt_tokens / completion_tokens / model_calls / tool_calls）
│
├── 1. ModelContextBuilder.build(turnContext, conversation)
│   ├── system prompt = turnContext.systemPrompt（已由 Assembly 层组装好：role_prompt + skills + 记忆）
│   ├── 历史消息（从 DB / 内存加载，压缩/裁剪后）
│   ├── 本轮累积消息（tool_call + tool_result，循环中追加）
│   ├── 当前用户消息
│   └── 按 ModelProfile 适配格式（XML/Markdown）
│
├── 2. 执行循环（带保护：maxIterations / context overflow 90%）
│   │
│   ├── streamText(messages, { abortSignal }) → streaming
│   │   ├── 分流：emit('text_delta') 推前端 + 缓冲完整响应
│   │   ├── 处理 thinking tokens（可选展示）
│   │   ├── prompt caching（Anthropic 启用）
│   │   ├── 支持取消（AbortController.signal）
│   │   └── 完成后累加 usage 到 turnUsage
│   │
│   ├── Response Router
│   │   ├── 纯文本 → 跳到步骤 3（收尾）
│   │   ├── 单个 tool_call → 进入工具执行
│   │   └── 多个 tool_calls → 并行工具执行
│   │
│   ├── Tool Executor（详见 3.20 审批流程）
│   │   ├── 权限分级
│   │   │   ├── auto：直接执行
│   │   │   ├── confirm：暂停，emit('tool_confirm')，await 用户决策（详见 3.20）
│   │   │   └── deny：返回错误给模型
│   │   ├── 并行执行：Promise.allSettled()（auto 立即 + confirm 等审批）
│   │   ├── 错误处理：工具异常/超时 → ToolResult { isError: true }，模型自行处理
│   │   ├── 结果截断（MAX_RESULT_TOKENS = 8000，防撑爆上下文）
│   │   └── emit('tool_start') / emit('tool_result') / emit('tool_error')
│   │
│   ├── Context Overflow 检查（详见 3.21）
│   │   └── estimateTokens > contextLimit × 90% → 优雅退出（生成总结）
│   │
│   └── 继续循环 → 回到 ModelContextBuilder
│
├── 3. Turn Finalize（任何退出路径都经过此步）
│   ├── 退出原因：text_complete / user_cancel / context_overflow / max_iterations / error
│   ├── 批量写入 DB（单事务）：user_message + assistant_message + tool_calls + tool_results + token_usage
│   ├── emit('done' | 'aborted' | 'error', { usage: turnUsage })
│   └── 异步触发记忆提取（对话结束时，由 ConversationService 判断）
│
└── abort() → AbortController.abort() → kill 子进程 → 收集 partial → Turn Finalize
```

### 3.3 对话三种形态

```
存储形态（DB）    ：完整历史，所有消息 + 工具结果，一条不丢
模型形态（API）   ：经过压缩/裁剪/摘要，每轮由 ModelContextBuilder 动态构建
展示形态（前端 UI）：格式化渲染，工具调用可折叠，代码高亮
```

IPC 只推原始 EngineEvent，前端自行决定渲染方式。

### 3.4 EngineEvent 事件类型

```ts
type EngineEvent = {
  conversationId: string          // 所有事件携带，Renderer 据此分发
} & (
  | { type: 'thinking' }           // 二期：extended thinking 输出
  | { type: 'text_delta', content: string }
  | { type: 'tool_start', tool: string, args: any, callId: string }
  | { type: 'tool_result', tool: string, result: any, callId: string, duration: number }
  | { type: 'tool_error', tool: string, error: string, callId: string }
  | { type: 'tool_confirm', tool: string, args: any, callId: string }
  | { type: 'context_compact' }
  | { type: 'error', error: Error, usage?: TurnUsage }
  | { type: 'done', usage: TurnUsage }
  | { type: 'aborted', usage?: TurnUsage }
)

// 事件载荷中的 usage（轻量，给前端展示用）
interface TurnUsage {
  prompt_tokens: number
  completion_tokens: number
  model_calls: number
  tool_calls: number
}
// DB 记录版见 3.22.1 TurnUsageRecord（含 provider_id / model_id / conversation_id）
```

事件通过 Electron IPC 从 Main 进程推送到 Renderer（`webContents.send('engine:event', event)`）。Renderer 通过 `ipcRenderer.on('engine:event', handler)` 监听。详见 3.10 IPC 层设计。

### 3.5 ExecutionContext

```ts
interface ExecutionContext {
  workingDir: string            // 工作目录（MVP：用户选择的目录）
  allowedPaths: string[]        // 安全沙箱
  env: Record<string, string>   // 环境变量
  projectId?: string            // 二期关联项目
}
```

### 3.6 ModelProfile

完整定义见 3.14.8。内置模型声明值见 3.14.6。

```ts
interface ModelProfile {
  contextWindow: number           // 上下文窗口大小
  maxOutput: number               // 最大输出 token
  supportsParallelTools: boolean  // 支持并行工具调用
  supportsThinking: boolean       // 支持 thinking/reasoning
  supportsCaching: boolean        // 支持 prompt caching
  preferredPromptFormat: 'xml' | 'markdown'
  costPerInputToken: number       // 输入 token 单价（美元，MVP 仅记录不计算）
  costPerOutputToken: number      // 输出 token 单价（美元，MVP 仅记录不计算）
}
```

### 3.7 Token 预算分配

```
总 context_limit（由 ModelProfile 决定）
├── system prompt:      20%（稳定，缓存友好）
├── 工具定义 schema:    固定开销
├── 历史消息:           60%（动态压缩/裁剪）
└── 当前轮次预留:       20%
```

规范/记忆超预算时按相关性裁剪，不全量注入。

### 3.8 工具系统（MVP）

内置工具清单：
```
文件类：FileRead / FileWrite / FileEdit / FileDelete
搜索类：Grep / Glob / DirList
执行类：Bash（timeout / 禁交互 / 路径限制）
网络类：WebFetch
```

Git 类工具（GitDiff / GitCommit / GitStatus）属于 CoCode 工作流能力，移至二期。

工具执行安全约束：
- Bash：默认 120s 超时，禁止交互式命令，工作目录限制于 ExecutionContext.allowedPaths
- FileWrite/Edit：操作前记录 intent，完成后标记 complete（崩溃恢复用）
- 所有工具结果截断上限（防撑爆上下文）

### 3.9 错误处理

| 错误类型 | 策略 |
|---|---|
| 模型调用失败（网络/5xx） | 重试 3 次（指数退避 1s/2s/4s）→ emit('error') + 持久化部分状态 |
| 模型调用 429 Rate Limit | 尊重 Retry-After header → 重试 → 全部失败同上 |
| 工具执行失败 | 不重试，包装为 ToolResult { isError: true }，模型自行决定重试/换方案/告知用户 |
| 工具执行超时 | kill 进程，返回 ToolResult { isError: true, error: 'timeout after Xs' }，模型调整方案 |
| 权限拦截（deny） | 返回 ToolResult { isError: true, error: 'Tool not allowed' } |
| 用户拒绝工具确认 | 返回 ToolResult { isError: true, error: 'User denied: [tool] with [args]' }，模型换方案 |
| 循环内上下文溢出 | 90% 阈值触发优雅退出：注入 system 指令 → 无工具 final call → 模型输出进度总结（详见 3.21） |
| max_iterations 超限 | 终止循环，Turn Finalize 正常持久化 |
| 用户取消 | AbortController.abort() → 收集 partial → Turn Finalize → emit('aborted')（详见 3.20） |

**核心原则**：工具错误交给模型处理（模型是决策者），模型 API 错误由框架自动重试，用户操作（取消/拒绝）优雅处理不丢数据。

### 3.10 IPC 层设计

#### 3.10.1 通信模式

两种模式：
- **请求-响应**（Renderer → Main → Renderer）：`ipcRenderer.invoke()` / `ipcMain.handle()`
- **事件推送**（Main → Renderer）：`webContents.send()` / `ipcRenderer.on()`

#### 3.10.2 IPC 频道定义

```
请求-响应频道：
conversation:list / create / delete / send-message / abort / messages / regenerate
agent:list / get / create / update / delete
skill:list / get / create / update / delete
provider:list / create / update / delete / test-connection / list-models / toggle-model
settings:get / set
tool:confirm-response              ← 用户确认/拒绝工具执行

事件推送频道（Main → Renderer）：
engine:event                       ← EngineEvent（text_delta / tool_start / tool_result / tool_error / tool_confirm / done / error / aborted）
conversation:title-updated         ← 标题自动生成完成（见 3.23）
```

#### 3.10.3 工具确认交互流程

```
AgentEngine 检测到 confirm 级别的 tool_call
    │
    ├── emit('tool_confirm', { tool, args, callId })
    │       ↓ webContents.send('engine:event', event)
    │       ↓ Renderer 弹出确认 UI
    │       ↓ 用户点击 允许/拒绝
    │       ↓ ipcRenderer.invoke('tool:confirm-response', { callId, approved })
    │
    ├── approved → 执行工具 → 结果回传模型
    └── rejected → 「用户拒绝执行」回传模型
```

执行循环在等待确认期间暂停（await Promise），不消耗额外资源。

### 3.11 前端状态管理

#### 3.11.1 方案：Zustand 按领域拆分 Store

```
Store 划分                         主要服务视图
─────────────────────────────    ─────────────────────
conversationStore                 首页对话区（会话列表 + 当前消息）
engineStore                       首页对话区（streaming 状态）
agentStore                        设置页 - Agent 管理
providerStore                     设置页 - Provider 管理
skillStore                        设置页 - Skill 管理
settingsStore                     全局（主题、默认 Agent 等）
```

#### 3.11.2 核心 Store 定义

> **核心数据类型**（Conversation / Message / Agent / Provider / Skill / Memory 等）由 `database-schema.sql` 映射为 TypeScript interface，定义在各 repo 文件中导出，此处不重复。

```ts
// conversationStore - 对话数据
interface ConversationStore {
  conversations: Conversation[]
  currentId: string | null
  messages: Map<string, Message[]>    // convId → messages，按需加载

  loadList(): Promise<void>
  create(agentId: string): Promise<string>
  select(id: string): Promise<void>   // 切换时按需加载消息
  delete(id: string): Promise<void>
  appendMessage(convId: string, msg: Message): void
  updateMessage(convId: string, msgId: string, patch: Partial<Message>): void
}

// engineStore - 执行状态
interface EngineStore {
  status: 'idle' | 'streaming' | 'confirming' | 'error' | 'cancelled'
  streamingText: string
  pendingConfirms: Map<string, ToolConfirm>  // callId → confirm info（支持并行多个）
  turnUsage: TurnUsage | null

  sendMessage(convId: string, content: string): void
  abort(): void
  confirmTool(callId: string, approved: boolean): void
}

// agentStore - Agent 管理（设置页）
interface AgentStore {
  agents: Agent[]
  loading: boolean

  loadList(): Promise<void>
  get(id: string): Promise<Agent>
  create(data: Partial<Agent>): Promise<string>
  update(id: string, patch: Partial<Agent>): Promise<void>
  delete(id: string): Promise<void>
}

// providerStore - Provider 管理（设置页）
interface ProviderStore {
  providers: Provider[]
  loading: boolean

  loadList(): Promise<void>
  create(data: Partial<Provider>): Promise<string>
  update(id: string, patch: Partial<Provider>): Promise<void>
  delete(id: string): Promise<void>
  testConnection(id: string): Promise<boolean>
  listModels(id: string): Promise<ProviderModel[]>
  toggleModel(providerId: string, modelId: string, enabled: boolean): Promise<void>
}

// skillStore - Skill 管理（设置页）
interface SkillStore {
  skills: Skill[]
  loading: boolean

  loadList(): Promise<void>
  get(id: string): Promise<Skill>
  create(data: Partial<Skill>): Promise<string>
  update(id: string, patch: Partial<Skill>): Promise<void>
  delete(id: string): Promise<void>
}

// settingsStore - 全局设置
interface SettingsStore {
  settings: Record<string, string>   // key-value
  loaded: boolean

  load(): Promise<void>
  get(key: string): string | undefined
  set(key: string, value: string): Promise<void>
}
```

#### 3.11.3 Streaming 数据流

```
用户发送消息
  → engineStore.sendMessage()
    → status = 'streaming'
    → ipcRenderer.invoke('conversation:send-message')
    → user message append 到 conversationStore

Main 进程推送 engine:event
  → text_delta:    engineStore.streamingText += content
  → tool_start:    conversationStore 追加 tool message 占位
  → tool_result:   更新对应 tool message（by callId）
  → tool_error:    更新对应 tool message 为错误状态（by callId）
  → tool_confirm:  engineStore.pendingConfirms.set(callId, {...}), status = 'confirming'
  → context_compact: UI 显示"正在压缩上下文..."提示（toast / inline indicator）
  → done:          streamingText 固化为 assistant message, 记录 turnUsage, status = 'idle'
  → aborted:       streamingText 固化为 partial message（标记 cancelled）, status = 'cancelled' → 'idle'
  → error:         status = 'error', 记录 turnUsage
```

#### 3.11.4 设计要点

- `streamingText` 是临时缓冲区，streaming 结束后固化为正式 message
- `messages` 用 Map 按 convId 存，切换对话时按需从 DB 加载
- 会话列表只加载元数据（id / title / updatedAt），不加载消息内容
- 组件通过 selector 按需订阅，未订阅的 store 变化不触发渲染

#### 3.11.5 Service 层接口

Service 层在 Main 进程中编排业务逻辑，IPC handler 直接调用 Service 方法：

```ts
// conversation.service.ts
class ConversationService {
  list(): Conversation[]
  create(agentId: string, workingDir: string): Conversation
  delete(id: string): void
  getMessages(id: string): Message[]
  sendMessage(id: string, content: string): void   // 触发 AgentAssembler + AgentEngine
  abort(id: string): void
}

// agent.service.ts
class AgentService {
  list(): Agent[]
  get(id: string): Agent
  create(data: Partial<Agent>): Agent
  update(id: string, patch: Partial<Agent>): Agent
  delete(id: string): void
}

// provider.service.ts
class ProviderService {
  list(): Provider[]
  create(data: Partial<Provider>): Provider
  update(id: string, patch: Partial<Provider>): Provider
  delete(id: string): void
  testConnection(id: string): Promise<{ status: 'connected' | 'disconnected' }>
  listModels(id: string): Promise<ProviderModel[]>
  toggleModel(providerId: string, modelId: string, enabled: boolean): void
}

// skill.service.ts — CRUD 同 AgentService 模式，略

// memory.service.ts — 完整接口见 3.15.9 MemoryService

// settings.service.ts
class SettingsService {
  get(key: string): string | null
  set(key: string, value: string): void
}
```

IPC handler 一行调用：`ipcMain.handle('agent:list', () => agentService.list())`

#### 3.11.6 Preload API 设计

```ts
// electron/preload.ts — contextBridge 暴露给 Renderer
contextBridge.exposeInMainWorld('cocoAPI', {
  // 请求-响应（invoke）
  conversation: {
    list: () => ipcRenderer.invoke('conversation:list'),
    create: (agentId, workingDir) => ipcRenderer.invoke('conversation:create', agentId, workingDir),
    delete: (id) => ipcRenderer.invoke('conversation:delete', id),
    getMessages: (id) => ipcRenderer.invoke('conversation:messages', id),
    sendMessage: (id, content) => ipcRenderer.invoke('conversation:send-message', id, content),
    abort: (id) => ipcRenderer.invoke('conversation:abort', id),
  },
  agent: { list, get, create, update, delete },      // 同模式
  provider: { list, create, update, delete, testConnection, listModels, toggleModel },
  skill: { list, get, create, update, delete },
  settings: { get, set },
  tool: {
    confirmResponse: (callId, approved) => ipcRenderer.invoke('tool:confirm-response', callId, approved),
  },

  // 事件监听（on）
  onEngineEvent: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('engine:event', handler)
    return () => ipcRenderer.removeListener('engine:event', handler)  // 返回 cleanup 函数
  },
  onTitleUpdated: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('conversation:title-updated', handler)
    return () => ipcRenderer.removeListener('conversation:title-updated', handler)
  },
})
```

前端 Store 中通过 `window.cocoAPI.conversation.list()` 调用，类型声明放在 `src/lib/ipc.ts`。

#### 3.11.7 Agent 组装入口

Cold Assembly + Hot Injection 的编排由 `ConversationService.sendMessage()` 负责：

```ts
// conversation.service.ts 中的 sendMessage 逻辑
async sendMessage(conversationId: string, content: string) {
  // 1. 获取或创建 AgentRuntime（Cold Assembly，缓存命中则跳过）
  const runtime = await this.assembler.getOrCreate(conversationId)

  // 2. Hot Injection — 每轮动态生成 TurnContext
  const turnContext = await this.assembler.buildTurnContext(runtime, content)

  // 3. 交给 Engine 执行
  await this.engine.run(turnContext, runtime, { conversationId, signal })
}
```

`AgentAssembler`（`core/agent/assembler.ts`）串联 AgentLoader + SkillExpander + PromptAssembler + MemoryInjector。

### 3.12 Agent 详细设计

#### 3.12.1 核心原则

- **配置驱动**：Agent 是一份 DB 配置记录，引擎动态加载，无独立运行实例
- **对话绑定**：一个 conversation 绑定一个 agent_id，不可中途切换
- **切换场景**：不同任务使用不同 Agent，新建对话时选择
- **默认 Agent**：settings 表存 `default_agent_id`，新对话默认使用

#### 3.12.2 Agent 配置 → 运行时映射

```
Agent 配置字段                     运行时效果
──────────────────────────────    ──────────────────────────────────
role_prompt                   →   system prompt [1] 角色定义
agent_skills → skills（结构化展开）→ system prompt [2] Skills 指令
tools (JSON array)            →   ToolRegistry 过滤，只暴露允许的工具
provider_id + model_id        →   ProviderRegistry 获取模型实例
context_limit                 →   ModelContextBuilder 的 token 预算上限
memory_scope                  →   记忆检索范围（conversation/project/global）
config.temperature 等          →   覆盖模型默认参数传入 streamText()
```

#### 3.12.3 Agent 生命周期

```
用户打开对话（新建 or 恢复，详见 3.19）
    │
    ├── Cold Assembly（详见 3.18.1）
    │   ├── AgentLoader: 从 DB 加载 Agent 配置
    │   ├── SkillExpander: 展开 Skills → prompt 片段 + 工具注册
    │   └── 输出 AgentRuntime（缓存在内存中）
    │
    └── 每次用户发消息
        ├── Hot Injection（详见 3.18.2）
        │   ├── MemoryInjector: 按当前消息检索相关记忆
        │   └── PromptAssembler: 合并 base prompt + 记忆 → TurnContext
        └── AgentEngine.run(turnContext, agentRuntime, ...)
            └── 执行循环（详见 3.2）
```

#### 3.12.4 内置 Agent（MVP）

| Agent | 用途 | Tools | Skills | 特征 |
|---|---|---|---|---|
| 通用助手 | 日常对话、代码问答、通用编码 | 全部 | 无 | 默认且唯一的 MVP Agent |

> 专业 Agent（前端开发、后端开发、架构师、代码审查、AI PM）移至二期，届时配合 Rules 独立体系和更多 Skills 一起上线。

### 3.13 Skill 机制详细设计

#### 3.13.1 Skill 是什么

Skill 是 **结构化的能力定义**，不是简单的 prompt 片段。它包含：
- 参数（可动态配置）
- 执行步骤（标准方法论）
- 输出规范（期望格式）
- 推荐工具（建议 Agent 使用哪些工具）

MVP 中，Skill 按结构展开为 prompt 注入 system prompt，Agent 自主判断何时使用哪些工具来执行。
二期，Skill 可升级为自动化执行流水线（SkillEngine）。

#### 3.13.2 Skill 数据结构

```ts
interface Skill {
  id: string
  name: string                    // "ComponentScanner"
  category: string                // "前端" | "后端" | "架构" | "Review" | "通用"
  description: string             // 给人看的说明
  type: 'builtin' | 'custom'

  // 核心：结构化定义
  parameters: SkillParameter[]    // 可配置参数
  steps: SkillStep[]              // 执行步骤（方法论）
  output_format: string           // 期望输出格式描述
  recommended_tools: string[]     // 建议使用的工具列表

  // 运行时
  status: 'active' | 'disabled'
  config: Record<string, any>     // 参数的当前值（实例级覆盖）
}

interface SkillParameter {
  name: string                    // "scan_path"
  type: 'string' | 'number' | 'boolean' | 'enum' | 'string[]'
  description: string             // 参数说明
  default: any                    // 默认值
  enum_values?: string[]          // type=enum 时的可选值
  required: boolean
}

interface SkillStep {
  name: string                    // "scan"
  instruction: string             // "扫描 {scan_path} 下所有 {framework} 组件文件"
  tools: string[]                 // 该步骤建议使用的工具
}
```

#### 3.13.3 Skill 示例：ComponentScanner

```json
{
  "name": "ComponentScanner",
  "category": "前端",
  "description": "扫描项目中的可复用 UI 组件模式，识别组件边界和复用机会",
  "parameters": [
    { "name": "scan_path", "type": "string", "default": "./src", "description": "扫描目录", "required": false },
    { "name": "framework", "type": "enum", "enum_values": ["react", "vue", "angular"], "default": "react", "description": "前端框架", "required": true },
    { "name": "min_lines", "type": "number", "default": 50, "description": "最小组件行数阈值", "required": false }
  ],
  "steps": [
    {
      "name": "scan_structure",
      "instruction": "扫描 {scan_path} 下所有 {framework} 组件文件，建立文件清单",
      "tools": ["Glob", "DirList"]
    },
    {
      "name": "analyze_components",
      "instruction": "逐个分析组件：识别 props 接口、状态管理方式、组件层级关系、超过 {min_lines} 行的大组件",
      "tools": ["FileRead", "Grep"]
    },
    {
      "name": "find_patterns",
      "instruction": "对比组件间的相似模式，识别可抽取为公共组件的重复逻辑",
      "tools": ["FileRead"]
    },
    {
      "name": "output_report",
      "instruction": "输出分析报告：组件清单、复用建议、重构优先级",
      "tools": []
    }
  ],
  "output_format": "Markdown 表格 + 分析说明",
  "recommended_tools": ["Glob", "DirList", "FileRead", "Grep"]
}
```

#### 3.13.4 Skill → Prompt 展开

ModelContextBuilder 在构建 system prompt 时，将 Skill 结构化展开：

```
## Skill: ComponentScanner
你具备「组件扫描分析」能力，当需要分析项目组件结构时，按以下方法执行：

**参数配置：**
- 扫描目录: ./src
- 前端框架: react
- 最小组件行数: 50

**执行步骤：**
1. [scan_structure] 扫描 ./src 下所有 react 组件文件，建立文件清单
   推荐工具: Glob, DirList
2. [analyze_components] 逐个分析组件：识别 props 接口、状态管理方式、组件层级关系、超过 50 行的大组件
   推荐工具: FileRead, Grep
3. [find_patterns] 对比组件间的相似模式，识别可抽取为公共组件的重复逻辑
   推荐工具: FileRead
4. [output_report] 输出分析报告：组件清单、复用建议、重构优先级

**输出格式：** Markdown 表格 + 分析说明
```

参数中的 `{变量}` 在展开时替换为实际配置值。

#### 3.13.5 Skill 配置层级

```
Skill 定义（skills 表）    → 默认参数值
    │
Agent 绑定（agent_skills）→ Agent 级参数覆盖（存 agent_skills.config）
    │
对话运行时               → 使用 Agent 级配置（MVP 不支持对话级动态调整）
```

#### 3.13.6 DB Schema 调整

```sql
-- agent_skills 增加 config 字段，支持 Agent 级参数覆盖
ALTER TABLE agent_skills ADD COLUMN config TEXT DEFAULT '{}';
-- config 示例: {"scan_path": "./src/components", "framework": "vue"}

-- skills 表调整：prompt 字段改为 definition（结构化 JSON）
-- skills.prompt → 废弃，改用 skills.definition 存储完整结构化定义
-- skills.definition: JSON，包含 parameters / steps / output_format / recommended_tools
```

#### 3.13.7 内置 Skill（MVP）

MVP 不预置内置 Skill——通用助手不绑定 Skill。Skill 基础设施（CRUD + 展开机制）就绪，用户可自行创建自定义 Skill。

> 二期随专业 Agent 上线时，预置以下 Skill：ComponentScanner、StyleLinter、APIDesigner、SecurityAuditor、RuleChecker、ComplexityAnalyzer。

### 3.14 Provider 层详细设计

#### 3.14.1 架构

```
ProviderRegistry（单例）
├── 启动时从 DB 加载所有 active providers
├── 为每个 provider 创建 Vercel AI SDK 实例
├── 提供 getModel(providerId, modelId) → AI SDK model
└── 管理连接状态、API Key 加解密

ProviderService（Service 层）
├── CRUD providers / provider_models
├── 连接测试
├── 模型列表管理（启用/禁用）
└── 通知 ProviderRegistry 刷新
```

#### 3.14.2 Provider 注册与初始化

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// 支持的 Provider 类型 → SDK 工厂映射
const SDK_FACTORIES = {
  anthropic: createAnthropic,
  openai: createOpenAI,
  google: createGoogleGenerativeAI,
  // 用户配置 OpenAI 兼容的第三方（如 DeepSeek、通义）也用 createOpenAI
  'openai-compatible': createOpenAI,
} as const

type ProviderType = keyof typeof SDK_FACTORIES

class ProviderRegistry {
  private instances: Map<string, any> = new Map()

  // 从 DB 加载并初始化
  init(providers: DBProvider[]) {
    for (const p of providers) {
      if (p.status === 'connected') {
        const factory = SDK_FACTORIES[p.type as ProviderType]
        this.instances.set(p.id, factory({
          apiKey: decrypt(p.api_key),
          baseURL: p.base_url || undefined,
        }))
      }
    }
  }

  // AgentEngine 调用时获取模型
  getModel(providerId: string, modelId: string) {
    const provider = this.instances.get(providerId)
    if (!provider) throw new Error(`Provider ${providerId} not available`)
    return provider(modelId)
  }
}
```

#### 3.14.3 Provider 类型

| Provider 类型 | SDK | 说明 |
|---|---|---|
| anthropic | @ai-sdk/anthropic | Claude 系列 |
| openai | @ai-sdk/openai | GPT 系列 |
| google | @ai-sdk/google | Gemini 系列 |
| openai-compatible | @ai-sdk/openai | DeepSeek、通义千问、Moonshot 等兼容 OpenAI 接口的供应商 |

`openai-compatible` 通过 `base_url` 区分不同供应商，用户配置时填入对应的 API endpoint。

#### 3.14.4 API Key 安全

```ts
import crypto from 'crypto'

// 密钥派生：基于 machine-id + 固定 salt
// machine-id 保证不同机器无法解密
const ENCRYPTION_KEY = deriveKey(getMachineId(), 'coco-api-key-salt')

function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(cipherText: string): string {
  const [ivHex, tagHex, encHex] = cipherText.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY,
    Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8')
}
```

存储在 SQLite `providers.api_key` 字段，密文格式 `iv:tag:encrypted`。

#### 3.14.5 连接测试

```ts
async function testConnection(providerId: string, modelId: string): Promise<boolean> {
  const model = providerRegistry.getModel(providerId, modelId)
  const { text } = await generateText({
    model,
    prompt: 'Hi',
    maxTokens: 10,
  })
  return true // 未抛异常即成功
}
```

用户在设置页添加/修改 Provider 后触发连接测试，成功后 `providers.status = 'connected'`。

#### 3.14.6 ModelProfile（内置声明式）

```ts
const MODEL_PROFILES: Record<string, ModelProfile> = {
  // Anthropic
  'claude-opus-4-5': {
    contextWindow: 200000,
    maxOutput: 32000,
    supportsParallelTools: true,
    supportsThinking: true,
    supportsCaching: true,
    preferredPromptFormat: 'xml',
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
  },
  'claude-sonnet-4-5': {
    contextWindow: 200000,
    maxOutput: 16000,
    supportsParallelTools: true,
    supportsThinking: true,
    supportsCaching: true,
    preferredPromptFormat: 'xml',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
  },
  // OpenAI
  'gpt-4o': {
    contextWindow: 128000,
    maxOutput: 16384,
    supportsParallelTools: true,
    supportsThinking: false,
    supportsCaching: false,
    preferredPromptFormat: 'markdown',
    costPerInputToken: 0.0000025,
    costPerOutputToken: 0.00001,
  },
  'o3-mini': {
    contextWindow: 200000,
    maxOutput: 100000,
    supportsParallelTools: true,
    supportsThinking: true,
    supportsCaching: false,
    preferredPromptFormat: 'markdown',
    costPerInputToken: 0.0000011,
    costPerOutputToken: 0.0000044,
  },
  // Google
  'gemini-2.0-flash': {
    contextWindow: 1048576,
    maxOutput: 8192,
    supportsParallelTools: true,
    supportsThinking: true,
    supportsCaching: false,
    preferredPromptFormat: 'markdown',
    costPerInputToken: 0.0000001,
    costPerOutputToken: 0.0000004,
  },
  // DeepSeek
  'deepseek-chat': {
    contextWindow: 64000,
    maxOutput: 8192,
    supportsParallelTools: false,
    supportsThinking: false,
    supportsCaching: false,
    preferredPromptFormat: 'markdown',
    costPerInputToken: 0.00000014,
    costPerOutputToken: 0.00000028,
  },
}

// 未在内置列表中的模型，使用保守默认值
const DEFAULT_PROFILE: ModelProfile = {
  contextWindow: 32000,
  maxOutput: 4096,
  supportsParallelTools: false,
  supportsThinking: false,
  supportsCaching: false,
  preferredPromptFormat: 'markdown',
  costPerInputToken: 0.000001,
  costPerOutputToken: 0.000004,
}

function getModelProfile(modelId: string): ModelProfile {
  return MODEL_PROFILES[modelId] ?? DEFAULT_PROFILE
}
```

#### 3.14.7 模型管理流程

```
用户设置页操作流程：

1. 添加 Provider
   ├── 选择类型（Anthropic / OpenAI / Google / OpenAI 兼容）
   ├── 填写 API Key（+ base_url，兼容类型必填）
   ├── 点击「测试连接」→ testConnection()
   └── 成功 → 保存，status = 'connected'

2. 管理模型列表
   ├── 内置模型自动出现（基于 Provider 类型 + MODEL_PROFILES 匹配）
   ├── 用户可手动添加模型（自定义 model_id）
   ├── 每个模型可启用/禁用（provider_models 记录）
   └── Agent 配置时只能选择已启用的模型

3. Provider 状态变更
   ├── API Key 修改 → 重新测试 → 更新 ProviderRegistry
   ├── Provider 删除 → 关联 Agent 的 provider_id 置 NULL
   └── Provider 断开 → 使用该 Provider 的 Agent 不可发起对话
```

#### 3.14.8 ModelProfile 扩展

```ts
interface ModelProfile {
  contextWindow: number           // 上下文窗口大小
  maxOutput: number               // 最大输出 token
  supportsParallelTools: boolean  // 支持并行工具调用
  supportsThinking: boolean       // 支持 thinking/reasoning
  supportsCaching: boolean        // 支持 prompt caching
  preferredPromptFormat: 'xml' | 'markdown'  // 偏好的 prompt 格式
  costPerInputToken: number       // 输入 token 单价（美元）
  costPerOutputToken: number      // 输出 token 单价（美元）
}
```

`provider_models.config` 可覆盖内置 ModelProfile 的任意字段（用户自定义模型场景）。

### 3.15 记忆系统详细设计

#### 3.15.1 设计原则

记忆是 Agent 的核心能力，MVP 必须完整实现。没有记忆的 Agent 每次对话都是全新的——不记得之前讨论过什么、不知道用户偏好什么、不会从错误中学习。

核心目标：
- **跨对话连续性**：第 N 次对话能利用前 N-1 次对话中积累的知识
- **上下文高效利用**：有限的 token 窗口内注入最有价值的信息
- **自动化运转**：提取、注入、衰减全自动，用户无需手动管理

#### 3.15.2 四层记忆架构

```
┌──────────────────────────────────────────────────────┐
│  第一层：短期记忆（Working Memory）                     │
│  位置：上下文窗口内                                     │
│  内容：当前对话的消息历史                                │
│  生命周期：对话期间                                     │
│  机制：消息数/token 超阈值时触发压缩                     │
├──────────────────────────────────────────────────────┤
│  第二层：情节记忆（Episodic Memory）                    │
│  位置：memories 表（scope = 'conversation'）           │
│  内容：对话摘要、关键决策、技术选型                      │
│  生命周期：跨对话持久，有衰减                            │
│  机制：对话结束后异步提取                                │
├──────────────────────────────────────────────────────┤
│  第三层：语义记忆（Semantic Memory）                    │
│  位置：memories 表（scope = 'project' / 'global'）    │
│  内容：项目事实、用户偏好、稳定知识                      │
│  生命周期：长期持久，高频召回的不衰减                     │
│  机制：从情节记忆中提炼升级，或用户显式指定               │
├──────────────────────────────────────────────────────┤
│  第四层：程序记忆（Procedural Memory）                  │
│  位置：role_prompt 内嵌（静态）+ execution_patterns 表（动态）│
│  内容：约束指令 + 执行模式（成功/失败/优化经验）         │
│  生命周期：约束永久，模式有衰减                          │
│  机制：约束写在 role_prompt 中；模式从执行历史中提取       │
└──────────────────────────────────────────────────────┘
```

#### 3.15.3 第一层：短期记忆（上下文压缩）

**触发条件**：当前对话消息的 token 总量超过历史消息预算（context_limit × 60%）的 80% 时触发。

**压缩策略**：

```
压缩前：
  [system prompt]
  [记忆注入]
  [msg-1] user: "帮我设计一个表单组件"
  [msg-2] assistant: "好的，我来分析需求..."（500 tokens）
  [msg-3] user: "用 React Hook Form"
  [msg-4] assistant: "明白，我来设计..."（800 tokens）
  ... 共 30 条消息 ...
  [msg-29] user: "最后加个提交按钮"
  [msg-30] assistant: 正在回答...

压缩后：
  [system prompt]
  [记忆注入]
  [msg-summary] system: "对话摘要：用户需要一个动态表单组件，
    使用 React Hook Form + Zod 校验。已完成 schema 定义、
    字段布局、动态增删逻辑。当前正在添加提交按钮。"
  [msg-25] ... 保留最近 N 条原始消息 ...
  [msg-30] assistant: 正在回答...
```

```ts
interface ContextCompressor {
  // 检查是否需要压缩
  shouldCompress(messages: Message[], budget: number): boolean

  // 执行压缩：保留最近 N 条，其余压缩为摘要
  compress(messages: Message[], keepRecent: number): Promise<{
    summary: string          // 压缩摘要
    kept: Message[]          // 保留的原始消息
    removedCount: number     // 被压缩的消息数
    savedTokens: number      // 节省的 token 数
  }>
}
```

**压缩模型选择**：使用当前对话所用模型的低成本版本（如 Anthropic → Haiku，OpenAI → gpt-4o-mini），或 Agent 配置中指定的压缩模型。

**压缩 prompt**：
```
你是上下文压缩器。将以下对话历史压缩为简洁摘要。

要求：
1. 保留所有关键决策和技术选型
2. 保留当前工作状态和进度
3. 保留用户明确表达的需求和约束
4. 丢弃寒暄、重复确认、中间过程细节
5. 输出不超过 500 tokens
```

#### 3.15.4 第二层 + 第三层：记忆提取（MemoryExtractor）

对话结束后（用户关闭对话 / 超过 5 分钟无新消息），异步触发记忆提取。

**提取流程**：

```
对话结束
    │
    ▼
MemoryExtractor.extract(conversation)
    │
    ├── 1. 构建提取输入
    │   ├── 如果对话较短（< 20 条消息）→ 直接使用全部消息
    │   └── 如果对话较长 → 先用压缩模型生成详细摘要
    │
    ├── 2. 调用提取模型（便宜模型）
    │   ├── 输入：对话内容 + 提取 prompt
    │   └── 输出：结构化 JSON（见下方）
    │
    ├── 3. 去重检查
    │   ├── 对每条新记忆，查询同 scope 下已有记忆
    │   ├── 关键词重叠度 > 70% → 调用模型判断是否重复
    │   ├── 重复 → 合并（保留更完整的版本，更新 updated_at）
    │   └── 不重复 → 新增
    │
    ├── 4. Scope 判定
    │   ├── 只在本次对话中有意义 → scope = 'conversation'
    │   ├── 对整个项目有意义 → scope = 'project'
    │   └── 对所有项目通用 → scope = 'global'
    │
    └── 5. 写入 memories 表
```

**提取 Prompt**：

```
你是记忆提取器。分析以下 AI 助手与用户的对话，提取有长期价值的信息。

输出严格 JSON 格式：
{
  "memories": [
    {
      "type": "summary | decision | fact | preference",
      "scope": "conversation | project | global",
      "content": "简洁的一句话描述"
    }
  ],
  "execution_patterns": [
    {
      "type": "success | failure | optimization",
      "description": "模式描述"
    }
  ]
}

类型说明：
- summary：本次对话做了什么（只需 1 条）
- decision：明确的技术选型或方案决策（如"选择 JWT 而非 Session"）
- fact：客观事实（如"项目使用 React 18 + TypeScript"）
- preference：用户偏好（如"不喜欢过度封装"、"要求函数式写法"）

scope 说明：
- conversation：仅与本次对话相关的信息
- project：对整个项目有意义（技术栈、架构决策、代码规范）
- global：对所有项目通用（用户个人偏好、工作习惯）

规则：
- 只提取有长期价值的信息
- 每条记忆不超过 100 字
- summary 必须有且只有 1 条
- 没有可提取的某类型，就不输出该类型
```

**提取输出示例**：

```json
{
  "memories": [
    {
      "type": "summary",
      "scope": "conversation",
      "content": "设计并实现了用户登录模块，包括 JWT 认证流程和 Token 刷新机制"
    },
    {
      "type": "decision",
      "scope": "project",
      "content": "认证方案选择 JWT + Refresh Token，不使用 Session，原因是纯前端架构无服务端状态"
    },
    {
      "type": "fact",
      "scope": "project",
      "content": "JWT 密钥存储在环境变量 JWT_SECRET，Token 有效期 15 分钟，Refresh Token 7 天"
    },
    {
      "type": "preference",
      "scope": "global",
      "content": "用户要求错误处理使用统一的 Result 类型，不用 try-catch"
    }
  ],
  "execution_patterns": [
    {
      "type": "success",
      "description": "修改认证相关文件前先 Grep 查找所有引用点，避免遗漏"
    }
  ]
}
```

#### 3.15.5 记忆注入（MemoryInjector）

每条用户消息到达时，Hot Injection 阶段（见 3.18.2）调用 MemoryInjector 查询并注入与 **当前消息** 相关的记忆。这是 per-turn 的操作，不同消息可能注入不同的记忆。

**注入流程**：

```
Hot Injection（每条消息）
    │
    ├── ... AgentRuntime.baseSystemPrompt 已就绪 ...
    │
    ├── MemoryInjector.inject(agent, conversationId, userMessage)
    │   │
    │   ├── 1. 确定检索范围
    │   │   ├── agent.memory_scope = 'conversation' → 只查本对话
    │   │   ├── agent.memory_scope = 'project' → 本对话 + 当前项目
    │   │   └── agent.memory_scope = 'global' → 本对话 + 当前项目 + 全局
    │   │
    │   ├── 2. 查询记忆（按优先级分组，MVP 用关键词匹配 + 时间排序）
    │   │   ├── MVP 检索策略：SQL LIKE 关键词匹配，不用向量（embedding 字段预留二期）
    │   │   ├── P0: 近期决策（type = 'decision'，最近 30 天）
    │   │   ├── P1: 项目事实（type = 'fact'，scope = 'project'）
    │   │   ├── P2: 用户偏好（type = 'preference'，scope = 'global'）
    │   │   ├── P3: 执行模式（execution_patterns，frequency >= 3）
    │   │   └── P4: 历史摘要（type = 'summary'，最近 5 条）
    │   │
    │   ├── 3. Token 预算裁剪
    │   │   ├── 总记忆预算：context_limit × 10%（独立于 system prompt 的 20%）
    │   │   ├── 按优先级从高到低填充，超预算时低优先级被截断
    │   │   └── 单条记忆超过 200 tokens 的进行压缩
    │   │
    │   └── 4. 格式化为消息
    │       └── 作为 system 角色消息插入到历史消息之前
    │
    └── ... 历史消息 + 当前用户消息 ...
```

**注入格式**：

```
[以下是与当前对话相关的历史上下文，供你参考：]

## 项目上下文
- 技术栈：React 18 + TypeScript 5.3 + Tailwind CSS
- 认证方案：JWT + Refresh Token
- 目录结构：src/components（UI 组件）、src/features（功能模块）、src/lib（工具函数）

## 历史决策
- 状态管理选择 Zustand，不用 Redux（2024-01-15）
- API 层使用 ky 替代 axios，体积更小（2024-01-20）

## 用户偏好
- 代码风格偏好简洁直白，不要过度封装
- 错误处理使用 Result 类型，不用 try-catch
- 组件一律使用函数式写法

## 经验模式
- 修改组件前先 Grep 查找所有引用点（历史验证有效）
- 样式冲突优先用 cn() 合并 className（历史验证有效）

[以上为历史上下文，请在回答中自然运用这些信息，不要主动复述。]
```

#### 3.15.6 记忆衰减与清理（MemoryDecay）

**衰减策略**：

```ts
interface MemoryDecayConfig {
  // 衰减触发：每次应用启动时 + 每 24 小时
  decayInterval: '24h'

  // 衰减规则
  rules: {
    // 未被召回的记忆，每天 relevance_score × 0.95
    unusedDecayRate: 0.95
    // 被召回一次，relevance_score 恢复到 1.0
    recallBoost: 1.0
    // 低于此阈值标记过期（expires_at = now + 7d）
    expirationThreshold: 0.3
    // 过期超过 7 天的物理删除
    cleanupAfterDays: 7
  }

  // 豁免规则（不衰减）
  exempt: {
    // decision 类型衰减更慢（× 0.98）
    decisionDecayRate: 0.98
    // global scope 的 preference 不衰减
    globalPreferenceExempt: true
    // 被召回次数 >= 5 的不衰减（已验证为高价值）
    highRecallExempt: 5
  }
}
```

**召回计数**：每次 MemoryInjector 将某条记忆注入对话时，更新该记忆的 `relevance_score = 1.0` 并记录召回次数（存在 memories 表新增的 `recall_count` 字段）。

**DB Schema 补充**（memories 表新增字段）：

```sql
ALTER TABLE memories ADD COLUMN recall_count INTEGER NOT NULL DEFAULT 0;
```

#### 3.15.7 去重与合并（MemoryDeduplicator）

```ts
interface MemoryDeduplicator {
  // 检查新记忆是否与已有记忆重复
  checkDuplicate(newMemory: Memory, existingMemories: Memory[]): Promise<{
    isDuplicate: boolean
    mergedContent?: string    // 合并后的内容（如果需要合并）
    existingId?: string       // 被合并的已有记忆 ID
  }>
}
```

**去重流程**：

```
新记忆: "项目使用 React 18 + TypeScript"

Step 1: 关键词提取
  → ["React", "18", "TypeScript"]

Step 2: 在同 scope 已有记忆中搜索
  → 找到: "项目技术栈是 React 18 + TypeScript + Tailwind"
  → 关键词重叠: 3/3 = 100% > 70% 阈值

Step 3: 调用便宜模型判断
  → prompt: "以下两条信息是否描述同一件事？
     A: 项目使用 React 18 + TypeScript
     B: 项目技术栈是 React 18 + TypeScript + Tailwind
     回答 SAME 或 DIFFERENT。如果 SAME，输出合并后的版本。"
  → 输出: "SAME. 合并: 项目技术栈是 React 18 + TypeScript + Tailwind"

Step 4: 更新已有记忆（保留更完整的版本）
```

#### 3.15.8 用户显式记忆

Agent 可以在回复中通过特殊标记主动创建记忆（类似 Claude Code 的 auto memory）：

```
Agent 回复中包含：
<memory scope="project">前端路由使用 React Router v6，采用 lazy loading</memory>

系统检测到 <memory> 标签：
  → 提取 content 和 scope
  → 走去重流程
  → 存入 memories 表
  → 从最终展示给用户的文本中移除标签
```

Agent 在 system prompt 中被告知可以使用此标记：
```
当你发现对项目有长期价值的信息时，可以使用 <memory scope="project|global">内容</memory>
标记来保存。这些信息会在后续对话中自动提供给你。
```

#### 3.15.9 MemoryService 完整接口

```ts
interface MemoryService {
  // === 提取 ===
  // 对话结束后异步提取记忆
  extractFromConversation(conversationId: string): Promise<void>

  // === 查询（注入用）===
  // 按 scope + 优先级查询相关记忆
  queryForInjection(params: {
    scope: 'conversation' | 'project' | 'global'
    conversationId?: string
    projectId?: string
    tokenBudget: number
  }): Promise<InjectedMemory[]>

  // === 显式操作 ===
  // Agent 通过 <memory> 标签创建
  addExplicit(memory: { scope: string; content: string; conversationId?: string }): Promise<void>

  // === 衰减 ===
  // 执行一次衰减计算
  decay(): Promise<{ decayed: number; expired: number }>
  // 清理过期记忆
  cleanup(): Promise<{ deleted: number }>

  // === 管理（设置页面用）===
  // 列出所有记忆（支持按 scope/type 过滤）
  list(filter?: { scope?: string; type?: string }): Promise<Memory[]>
  // 手动删除某条记忆
  delete(memoryId: string): Promise<void>
  // 手动编辑某条记忆
  update(memoryId: string, content: string): Promise<void>
}

interface InjectedMemory {
  id: string
  type: string
  content: string
  priority: number         // 注入优先级
  tokenCount: number       // 预估 token 数
}
```

#### 3.15.10 记忆与 Agent 体系集成

```
记忆系统的 4 个集成点：

1. 每条消息前 → MemoryInjector 注入相关记忆（Hot Injection）
   位置：Assembly 层 Hot Injection 阶段（见 3.18.2）
   时机：用户发消息后、AgentEngine.run() 前
   方式：根据用户当前消息检索记忆 → 注入 TurnContext.systemPrompt

2. 每轮回复后 → 检测 <memory> 标签
   位置：AgentEngine 收到完整 assistant 回复后
   时机：同步处理，提取后从展示文本中移除标签

3. 上下文压缩时 → 压缩摘要保存为临时记忆
   位置：ContextCompressor.compress() 内
   时机：压缩执行后，摘要作为 system 消息替换原始消息

4. 对话结束后 → MemoryExtractor 异步提取
   位置：AgentEngine 外部，由 ConversationService 触发
   时机：对话标记为结束 / 超时无新消息
   注意：异步执行，不阻塞用户操作
```

#### 3.15.11 DB Schema 完整映射

记忆系统使用已有的两张表：

```
memories 表：
├── scope = 'conversation' + type = 'summary'     → 第二层：对话摘要
├── scope = 'conversation' + type = 'decision'    → 第二层：对话中的决策
├── scope = 'project' + type = 'fact'             → 第三层：项目知识
├── scope = 'project' + type = 'decision'         → 第三层：项目级决策
├── scope = 'global' + type = 'preference'        → 第三层：用户偏好
├── scope_id                                       → conversation_id 或 project_id
├── relevance_score                                → 衰减权重
├── recall_count（新增）                            → 召回次数
├── source_message_id                              → 来源消息（可追溯）
└── expires_at                                     → 遗忘机制

execution_patterns 表：
├── pattern_type = 'success'                       → 第四层：成功模式
├── pattern_type = 'failure'                       → 第四层：失败模式
├── pattern_type = 'optimization'                  → 第四层：优化模式
├── frequency                                      → 出现频次（频次高 = 更可靠）
└── agent_id                                       → 关联 Agent（不同 Agent 有不同模式）

Agent.role_prompt：
└── 内嵌约束指令                                    → 第四层：静态规范（直接写在 role_prompt 中，二期独立为 rules 表）
```

### 3.16 工具系统实现详细设计

#### 3.16.1 工具接口（MCP 兼容）

所有工具实现同一接口，从第一天按 MCP 规范设计，二期可无缝接入外部 MCP Server：

```ts
interface Tool {
  name: string                          // "FileRead"
  description: string                   // 给模型看的描述
  parameters: JSONSchema                // 参数 schema（Vercel AI SDK 直接用）

  execute(args: any, context: ToolContext): Promise<ToolResult>
}

interface ToolContext {
  workingDir: string                    // 当前工作目录
  allowedPaths: string[]                // 安全沙箱路径
  abortSignal: AbortSignal              // 取消信号
  emit: (event: EngineEvent) => void    // 事件推送
}

interface ToolResult {
  content: string                       // 返回给模型的文本
  isError?: boolean                     // true 时模型会尝试自愈（见 3.9 错误处理）
  error?: string                        // 错误描述（isError=true 时填充）
  metadata?: Record<string, any>        // 元数据（不发给模型，日志用）
}
```

#### 3.16.2 ToolRegistry

```ts
class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  // 启动时注册所有内置工具
  registerBuiltin(): void

  // 按 Agent 配置过滤
  getToolsForAgent(allowedTools: string[]): Tool[]

  // 转成 Vercel AI SDK 的 tools 参数格式
  toAISDKTools(allowedTools: string[]): Record<string, CoreTool>
}
```

`toAISDKTools()` 把内部 Tool 接口适配为 Vercel AI SDK `streamText()` 需要的格式，让工具定义和 SDK 解耦。

#### 3.16.3 各工具实现要点

**文件类**：

| 工具 | 关键实现 |
|---|---|
| FileRead | `fs.readFile()`，路径安全检查，大文件截断（默认 2000 行），支持 offset + limit 分页读取 |
| FileWrite | 写前备份原内容到内存（单次对话级 undo），路径安全检查，自动创建中间目录 |
| FileEdit | 精确字符串替换（old_string → new_string），返回修改后的上下文片段（前后 5 行） |
| FileDelete | 路径安全检查，记录删除操作（崩溃恢复用） |

**搜索类**：

| 工具 | 关键实现 |
|---|---|
| Grep | 底层用 ripgrep（系统有时）或 Node 实现，支持正则，返回匹配行 + 文件路径 + 行号，结果截断 |
| Glob | `fast-glob` 库，支持 include/exclude 模式，返回文件路径列表 |
| DirList | `fs.readdir()` + `fs.stat()`，返回目录树（限深度 3 层），标注文件/目录/大小 |

**执行类**：

| 工具 | 关键实现 |
|---|---|
| Bash | `child_process.spawn()`，设置 cwd / timeout（默认 120s）/ maxBuffer，禁止交互式命令，结果截断，abort 时转发 kill 信号 |

**网络类**：

| 工具 | 关键实现 |
|---|---|
| WebFetch | `fetch()` + `@mozilla/readability` 提取正文，返回纯文本，超时 30s，结果截断 |

#### 3.16.4 路径安全机制

所有文件类工具和 Bash 的核心安全边界：

```ts
function validatePath(targetPath: string, context: ToolContext): string {
  const resolved = path.resolve(context.workingDir, targetPath)
  const isAllowed = context.allowedPaths.some(
    allowed => resolved.startsWith(path.resolve(allowed))
  )
  if (!isAllowed) {
    throw new ToolError(`路径 ${resolved} 不在允许范围内`)
  }
  return resolved
}
```

- 所有文件类工具执行前调用 `validatePath()`
- Bash 通过 `cwd` 参数限制工作目录
- 路径遍历攻击（`../../`）由 `path.resolve()` + 前缀检查防御

#### 3.16.5 结果截断

防止工具结果撑爆上下文：

```ts
const MAX_RESULT_TOKENS = 8000  // 约 32000 字符

function truncateResult(content: string): string {
  if (content.length <= MAX_RESULT_TOKENS * 4) return content

  const maxChars = MAX_RESULT_TOKENS * 4
  return content.slice(0, maxChars) +
    `\n\n[结果已截断，原始长度 ${content.length} 字符，显示前 ${maxChars} 字符]`
}
```

所有工具的 execute() 返回前自动经过截断处理。

#### 3.16.6 工具权限分级

```
auto（无风险，自动执行）：
  FileRead, Grep, Glob, DirList

confirm（有副作用，需用户确认）：
  FileWrite, FileEdit, FileDelete, Bash, WebFetch

deny（不在白名单内）：
  Agent 未配置的工具
```

权限分级由 AgentEngine 在处理 tool_calls 时判断，不在工具内部处理。

### 3.17 项目目录结构

```
coco/
├── electron/                          # Main 进程代码
│   ├── main.ts                        # 入口：创建窗口、注册 IPC
│   ├── preload.ts                     # preload 脚本（暴露安全 API 给 Renderer）
│   │
│   ├── ipc/                           # IPC 层
│   │   ├── index.ts                   # 注册所有 handler
│   │   ├── conversation.ipc.ts
│   │   ├── agent.ipc.ts
│   │   ├── provider.ipc.ts
│   │   ├── skill.ipc.ts
│   │   ├── settings.ipc.ts
│   │   └── tool-confirm.ipc.ts
│   │
│   ├── services/                      # Service 层（业务编排）
│   │   ├── conversation.service.ts
│   │   ├── agent.service.ts
│   │   ├── provider.service.ts
│   │   ├── skill.service.ts
│   │   ├── settings.service.ts
│   │   └── memory.service.ts
│   │
│   ├── core/                          # Core 层（引擎逻辑）
│   │   ├── agent/                     # Agent 组装层（见 3.18）
│   │   │   ├── assembler.ts           # 编排入口：串联 Cold Assembly + Hot Injection（见 3.11.7）
│   │   │   ├── agent-loader.ts        # 从 DB 加载 Agent 配置
│   │   │   ├── skill-expander.ts      # Skill → prompt 片段 + 工具集展开
│   │   │   └── prompt-assembler.ts    # 组装最终 system prompt（Cold base + Hot 记忆）
│   │   │
│   │   ├── engine/
│   │   │   ├── agent-engine.ts        # AgentEngine 执行循环
│   │   │   ├── model-context-builder.ts
│   │   │   ├── context-compressor.ts  # 上下文压缩
│   │   │   └── usage-tracker.ts       # Token 用量累加（见 3.22）
│   │   │
│   │   ├── memory/
│   │   │   ├── memory-extractor.ts    # 记忆提取
│   │   │   ├── memory-injector.ts     # 记忆注入
│   │   │   ├── memory-deduplicator.ts # 去重
│   │   │   └── memory-decay.ts        # 衰减
│   │   │
│   │   ├── tools/
│   │   │   ├── registry.ts            # ToolRegistry
│   │   │   ├── types.ts               # Tool / ToolContext / ToolResult 接口
│   │   │   ├── file-read.ts
│   │   │   ├── file-write.ts
│   │   │   ├── file-edit.ts
│   │   │   ├── file-delete.ts
│   │   │   ├── grep.ts
│   │   │   ├── glob.ts
│   │   │   ├── dir-list.ts
│   │   │   ├── bash.ts
│   │   │   ├── web-fetch.ts
│   │   │
│   │   └── provider/
│   │       ├── registry.ts            # ProviderRegistry
│   │       ├── model-profiles.ts      # 内置 ModelProfile
│   │       └── crypto.ts              # API Key 加解密
│   │
│   └── data/                          # Data 层
│       ├── database.ts                # SQLite 初始化 + 迁移
│       ├── schema.sql                 # DDL
│       └── repositories/              # 数据访问
│           ├── conversation.repo.ts
│           ├── message.repo.ts
│           ├── agent.repo.ts
│           ├── provider.repo.ts
│           ├── skill.repo.ts
│           ├── memory.repo.ts
│           ├── token-usage.repo.ts
│           ├── execution-pattern.repo.ts
│           └── settings.repo.ts
│
├── src/                               # Renderer 进程代码（React UI）
│   ├── main.tsx                       # React 入口
│   ├── App.tsx                        # 路由 + 布局
│   │
│   ├── stores/                        # Zustand stores
│   │   ├── conversation.store.ts
│   │   ├── engine.store.ts
│   │   ├── agent.store.ts
│   │   ├── provider.store.ts
│   │   ├── skill.store.ts
│   │   └── settings.store.ts
│   │
│   ├── pages/                         # 页面级组件
│   │   ├── home/                      # 首页（对话）
│   │   │   ├── HomePage.tsx
│   │   │   ├── ConversationList.tsx   # 左侧会话列表
│   │   │   ├── ChatArea.tsx           # 中间对话区
│   │   │   ├── MessageItem.tsx
│   │   │   ├── ToolCallBlock.tsx      # 工具调用渲染
│   │   │   └── InputBar.tsx           # 输入框
│   │   │
│   │   └── settings/                  # 设置页
│   │       ├── SettingsPage.tsx
│   │       ├── ProviderSettings.tsx
│   │       ├── AgentSettings.tsx
│   │       ├── SkillSettings.tsx
│   │       └── AppearanceSettings.tsx
│   │
│   ├── components/                    # 通用 UI 组件
│   │   ├── ui/                        # shadcn/ui 基础组件（Button, Input, Dialog...）
│   │   ├── Markdown.tsx               # Markdown 渲染
│   │   ├── CodeBlock.tsx              # 代码高亮
│   │   └── ToolConfirmDialog.tsx      # 工具确认弹窗
│   │
│   ├── lib/                           # 工具函数
│   │   ├── ipc.ts                     # IPC 调用封装
│   │   └── utils.ts
│   │
│   └── styles/
│       └── globals.css                # Tailwind 入口
│
├── docs/                              # 文档（已有）
│   ├── technical-architecture.md
│   └── database-schema.sql
│
├── prd/                               # PRD + Demo（已有）
│
├── package.json
├── tsconfig.json
├── electron-builder.yml               # 打包配置
├── vite.config.ts
├── tailwind.config.ts
└── .gitignore
```

#### 3.17.1 目录设计原则

- **Main / Renderer 物理隔离**：`electron/` vs `src/`，编译产物分开，防止错误引用
- **Main 进程四层对应**：`ipc/` → `services/` → `core/` → `data/`，和架构图一致
- **工具一文件一实现**：`tools/` 下每个工具独立文件，方便增删
- **Repository 模式**：`data/repositories/` 封装 SQL，Service 层不直接写 SQL
- **前端按页面组织**：`pages/home/` 和 `pages/settings/` 各自包含该页面的所有组件
- **二期扩展点**：`pages/` 下可新增 `project/` 目录，`electron/core/` 下可新增 `orchestrator/`

### 3.18 Agent 组装层详细设计

Agent 的运行时不是一个固定实例，而是每次对话时动态组装的。组装分为两个阶段：

#### 3.18.1 Cold Assembly（冷组装，对话打开时执行一次）

```
用户打开对话（新建 or 恢复）
    │
    ├── AgentLoader
    │   └── 从 DB 加载 Agent 配置 → AgentConfig
    │
    ├── SkillExpander
    │   └── 每个 Skill 展开为：
    │       ├── prompt 片段（注入 system prompt）
    │       └── 推荐工具（注册到 ToolRegistry）
    │
    └── 输出 → AgentRuntime（缓存在内存中，对话期间复用）
```

```ts
interface AgentRuntime {
  baseSystemPrompt: string      // role_prompt + skills（静态部分，约束直接写在 role_prompt 中）
  toolSet: Tool[]               // 过滤后的工具集
  modelConfig: {                // 模型配置
    providerId: string
    modelId: string
    temperature: number
    maxTokens?: number
  }
  memoryScope: 'conversation' | 'project' | 'global'
  maxIterations: number         // 循环安全阀
  contextLimit: number          // token 上限
}
```

#### 3.18.2 Hot Injection（热注入，每条消息执行一次）

Cold Assembly 生成的 `AgentRuntime` 是静态的，但记忆是动态的——不同消息需要注入不同的相关记忆。

```
每条用户消息到达
    │
    ├── MemoryInjector.retrieve(userMessage, memoryScope)
    │   └── 根据当前消息内容检索相关记忆（关键词匹配 + 优先级排序）
    │
    ├── PromptAssembler.merge(agentRuntime.baseSystemPrompt, memories)
    │   └── 将静态 base prompt 与动态记忆合并
    │   └── 控制记忆注入的 token 预算（context_limit × 10%）
    │
    └── 输出 → TurnContext（本轮的完整上下文配置）
```

```ts
interface TurnContext {
  systemPrompt: string          // baseSystemPrompt + 注入的记忆
  relevantMemories: InjectedMemory[]  // 本轮检索到的记忆（调试用）
  tokenBudget: number           // 剩余可用于历史消息的 token 预算
}
```

#### 3.18.3 Cold vs Hot 分工

| | Cold Assembly | Hot Injection |
|---|---|---|
| 时机 | 对话打开时（一次） | 每条消息（每轮） |
| 输入 | Agent DB 配置 | 用户当前消息 + AgentRuntime |
| 输出 | AgentRuntime | TurnContext |
| 内容 | role_prompt + skills + tools + model | 记忆检索 + prompt 合并 |
| 性能 | DB 查询，毫秒级 | 记忆检索，毫秒级（无模型调用） |
| 缓存 | 整个对话期间复用 | 不缓存，每轮重新计算 |

### 3.19 对话入口：新建 vs 恢复

#### 3.19.1 两条入口路径

```
Path A: 新建对话
    │
    ├── 用户选择 Agent（或使用默认）
    ├── 创建 conversation 记录（绑定 agent_id）
    ├── Cold Assembly → AgentRuntime（缓存）
    └── 就绪，等待第一条消息

Path B: 恢复对话（用户从侧边栏打开已有对话）
    │
    ├── 从 DB 加载 conversation.agent_id
    ├── Cold Assembly → AgentRuntime（同样流程，同样结果）
    ├── 从 DB 加载历史 messages
    ├── ContextCompressor 检查：历史是否超 token 预算？
    │   ├── 未超 → 直接使用
    │   └── 已超 → 压缩后使用（下一条消息时触发）
    └── 就绪，等待下一条消息
```

#### 3.19.2 设计要点

- **两条路径收敛到同一点**：AgentRuntime 已缓存 + conversation 存在于 DB。从这里开始，每条消息走 **完全相同** 的 Hot Injection → Engine 流程
- **Engine 内没有 "恢复" 特殊逻辑**：cancelled / error 状态的历史消息原样保留在 messages 中，用户发下一条消息就正常继续
- **上次中断的状态不影响恢复**：partial 消息、cancelled 标记都只是历史记录，不需要特殊处理

### 3.20 Confirm 级工具审批流程

#### 3.20.1 审批机制

Engine 执行循环中的 Tool Executor 遇到 confirm 级工具时，通过 Promise 暂停等待用户决策：

```
Tool Executor 收到 tool_call
    │
    ├── ToolRegistry.get(name) → 检查权限级别
    │
    ├── 权限 = 'auto' → 直接执行
    │
    ├── 权限 = 'confirm' → 暂停等待审批
    │   │
    │   ├── 创建 Promise + resolver，按 callId 存储
    │   │
    │   ├── emit tool_confirm { toolName, args, callId }
    │   │   → IPC 推送到 Renderer
    │   │   → UI 显示审批卡片（工具名 + 参数预览）
    │   │
    │   ├── await promise（Engine 在此阻塞）
    │   │
    │   ├── 用户点击 Approve
    │   │   → Renderer 发送 tool:confirm-response { callId, approved: true }
    │   │   → Promise resolve → 执行工具 → 返回正常 ToolResult
    │   │
    │   ├── 用户点击 Deny
    │   │   → tool:confirm-response { callId, approved: false }
    │   │   → Promise resolve → 返回 ToolResult { isError: true,
    │   │       error: 'User denied: [tool_name] with args [summary]' }
    │   │   → 模型看到拒绝，调整方案
    │   │
    │   └── 用户点击 Cancel（取消整轮）
    │       → AbortController.abort()
    │       → Promise reject → 轮次结束
    │
    └── 权限 = 'deny' → 直接返回 ToolResult { isError: true, error: 'Tool not allowed' }
```

#### 3.20.2 并行工具调用时的 Confirm 处理

模型可能一次返回多个 tool_calls，其中混合 auto 和 confirm 级别：

```
多个 tool_calls 到达
    │
    ├── auto 级别的 → 立即开始并行执行
    ├── confirm 级别的 → 各自独立 emit tool_confirm
    │   └── UI 可同时显示多个审批卡片
    │
    └── Promise.allSettled() 等待所有工具（auto + confirm）完成
        └── 所有结果一起追加到 messages
```

#### 3.20.3 审批等待不设超时

审批等待没有超时机制，Engine 无限等待用户决策（和 Claude Code 的权限提示一致）。退出方式只有三种：
- 用户 Approve/Deny（正常路径）
- 用户 Cancel 整轮（AbortController）
- App 关闭（轮次未持久化，视为从未发生）

### 3.21 循环内 Context 溢出保护

#### 3.21.1 问题

ContextCompressor 只在每轮开始时检查历史消息长度。但如果一轮循环内模型连续调用多个工具，每次工具结果都追加到 messages，可能在循环 **中途** 超过 token 预算。

#### 3.21.2 解决方案：90% 阈值 + 优雅退出

```
Engine 循环内，每次 tool result 追加到 messages 后：
    │
    ├── estimateTokens(allMessages)
    │   └── 粗略估算：字符数 / 4（不需要精确，90% 阈值留了足够缓冲）
    │
    ├── 未超过 context_limit × 90% → 正常继续循环
    │
    └── 超过 90% → 触发优雅退出：
        │
        ├── 1. 注入 system 指令到 messages：
        │   "Context limit approaching. Summarize your progress
        │    and what remains to be done. Do NOT call any more tools."
        │
        ├── 2. 最后一次 streamText()（不注册任何工具，强制纯文本输出）
        │   → 模型输出进度总结给用户
        │
        └── 3. 正常 Turn Finalize（persist + emit 'done'）
```

用户看到的效果：Agent 说"我已经完成了 X、Y、Z，还需要做 A、B，你可以在下一条消息中让我继续。"下一条消息开始时，ContextCompressor 会压缩累积的历史。

### 3.22 Token 用量追踪

#### 3.22.1 收集机制

每次 `streamText()` 调用后，Vercel AI SDK 返回 `usage { promptTokens, completionTokens }`。一轮可能有 N 次模型调用（N-1 次工具循环 + 1 次最终输出），Engine 在内存中累加：

```ts
// DB 记录版（写入 token_usage 表），扩展自事件载荷版 TurnUsage（见 3.4）
interface TurnUsageRecord extends TurnUsage {
  provider_id: string
  model_id: string
  conversation_id: string
  created_at: string
}
```

Engine 内部用 `TurnUsage`（4 字段）累加，Turn Finalize 时补充 provider/model/conversation 信息写入 DB。

#### 3.22.2 存储

`token_usage` 表，每轮一条记录。在 Turn Finalize 阶段与 messages 在同一个 DB 事务中写入。

```sql
CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  model_calls INTEGER NOT NULL DEFAULT 1,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.22.3 事件传递

所有 turn 结束事件都携带 usage：
- `done` → `{ usage: TurnUsage }`
- `aborted` → `{ usage: TurnUsage }`（部分值）
- `error` → `{ usage: TurnUsage }`（部分值）

Renderer 可在消息旁显示 token 计数 badge。

#### 3.22.4 MVP 展示

- 每条消息：小 token badge（如 "1.2k tokens"）
- 每个对话：header 区域显示累计 token
- 不做费用计算（需要配置每个模型的价格，后续增强）

### 3.23 对话标题自动生成

首轮对话完成后，异步生成对话标题：

```
首轮 Turn Finalize 完成（done 事件发出后）
    │
    ├── 检查 conversation.title 是否为空
    │   ├── 非空 → 跳过（用户已手动设置）
    │   └── 为空 → 异步生成标题
    │
    ├── 调用同一模型，单次请求：
    │   ├── system: "用 10 字以内的中文总结这段对话主题，直接输出标题，不要引号"
    │   └── messages: [用户首条消息, 助手首条回复]
    │
    ├── 更新 DB: conversations.title = 生成结果
    └── IPC 推送 conversation:title-updated { id, title } → 前端更新侧边栏
```

- 不阻塞对话流程，生成失败不影响对话
- 用户可在侧边栏手动编辑标题（覆盖自动生成）

### 3.24 记忆提取触发机制

MemoryExtractor 的触发条件（3.15.4 补充）：

```
触发条件（满足任一即触发）：
    │
    ├── 1. 用户手动关闭对话（侧边栏切换 / 关闭窗口）
    │   └── Main 进程 conversation:close 事件 → 立即触发
    │
    └── 2. 闲置超时（5 分钟无新消息）
        ├── 每条消息的 Turn Finalize 后：
        │   ├── clearTimeout(extractionTimer)
        │   └── extractionTimer = setTimeout(triggerExtraction, 5 * 60 * 1000)
        └── 对话关闭时 clearTimeout 避免重复触发
```

- Timer 在 Main 进程中管理，与 AgentRuntime 生命周期绑定
- 提取是异步操作，不影响用户继续发消息
- 如果提取过程中用户发新消息，取消本次提取，重置 timer

### 3.25 对话恢复：Agent 删除 fallback

Path B（恢复对话）的 Agent 缺失处理（3.19.1 补充）：

```
从 DB 加载 conversation.agent_id
    │
    ├── agent_id 存在 → 正常 Cold Assembly
    │
    └── agent_id = NULL（Agent 已删除）
        ├── fallback 到默认 Agent（settings.default_agent_id → 通用助手）
        ├── 更新 conversation.agent_id = 默认 Agent ID
        └── IPC 推送提示："原 Agent 已删除，已切换到通用助手"
```

### 3.26 工作目录选择

ExecutionContext.workingDir 的来源（3.5 补充）：

```
新建对话时：
    ├── 弹窗让用户选择工作目录（Electron dialog.showOpenDialog）
    ├── 默认值 = settings 表中的 default_working_dir（上次使用的目录）
    ├── 用户选择后写入 conversations.working_dir
    └── 同时更新 settings.default_working_dir（下次默认）

恢复对话时：
    └── 直接使用 conversations.working_dir（已持久化）
```

- 工作目录决定了文件类工具和 Bash 的 cwd
- 工作目录同时作为 allowedPaths 的根路径（安全沙箱边界）

### 3.27 Provider 模型列表来源

```
用户添加 Provider（输入 name / type / api_key）
    │
    ├── type = "anthropic" / "openai" / "google"
    │   └── 自动填充内置模型列表（hardcode 在 model-profiles.ts 中）
    │       ├── 写入 provider_models 表（enabled=1）
    │       └── 用户可在设置页禁用/启用单个模型
    │
    └── type = "openai-compatible"
        └── 用户手动添加模型（输入 model_id + display_name）
            └── 写入 provider_models 表
```

- 不调用 API 自动发现模型（各厂商 API 不统一，部分不支持 list-models）
- `test-connection` 用该 Provider 的第一个 enabled 模型发简单请求验证 API Key
- 内置列表随 app 版本更新，新增模型时自动补充（对比已有 provider_models）

### 3.28 消息重新生成（Regenerate）

```
用户点击 assistant 消息上的 Regenerate 按钮
    │
    ├── 前端：engineStore.regenerate(conversationId, messageId)
    │
    ├── IPC: conversation:regenerate { conversationId, messageId }
    │
    └── 后端 ConversationService.regenerate()
        ├── 1. 找到该 assistant message 及其关联的 tool messages
        ├── 2. 从 DB 删除这些消息
        ├── 3. 找到其前一条 user message 的 content
        ├── 4. 调用 sendMessage(conversationId, content) 重新执行
        └── 前端自动收到新的 engine:event 流
```

- 等价于"撤回 AI 回复 + 用同一条用户消息重发"
- 只能 regenerate 最后一轮的 assistant 回复（中间轮次不支持，避免上下文断裂）

### 3.29 应用生命周期

```
Electron app 启动
    ├── 初始化 SQLite（better-sqlite3，同步）
    ├── 初始化 ProviderRegistry（加载 providers，创建 SDK 实例）
    └── 就绪，等待用户操作

窗口关闭 / app.quit（before-quit 事件）
    │
    ├── 1. 如果 Engine 正在执行
    │   ├── abort() → AbortController.abort()
    │   ├── 等待 Turn Finalize 完成（最多 3 秒）
    │   └── 超时则强制退出（消息可能未持久化）
    │
    ├── 2. 清理记忆提取 timer
    │   ├── clearTimeout(extractionTimer)
    │   └── 如果有活跃对话且 > 3 条消息 → 同步触发 MemoryExtractor
    │       （用 Promise.race 限时 5 秒，超时放弃）
    │
    ├── 3. 清理 AgentRuntime 缓存
    │
    ├── 4. 关闭 SQLite 连接（better-sqlite3 同步 close，不丢数据）
    │
    └── 5. app.exit()
```

### 3.30 DB 写入失败处理

Turn Finalize 的 DB batch write 失败时的策略：

```
Turn Finalize → DB 写入失败
    │
    ├── 1. console.error 记录详细错误（含 messages 快照）
    │
    ├── 2. emit error 事件给前端（附带 usage 信息）
    │
    ├── 3. 前端 Store 中的消息保持不变
    │   └── 本次会话期间用户仍可看到完整对话
    │
    ├── 4. 下次 sendMessage 时
    │   └── ModelContextBuilder 从 Store 消息构建上下文（不从 DB 重读）
    │
    └── 5. 用户关闭对话再打开 → 该轮消息丢失
        └── 可接受：SQLite + WAL 写入失败概率极低（磁盘满 / 权限异常）
```

- 不做复杂恢复机制（retry / write-ahead log），MVP 保持简单
- 如果频繁出现，提示用户检查磁盘空间

---

## 四、二期架构预留（CoCode，待深入讨论）

以下设计已识别但不在 MVP 范围内，二期开始前需深入讨论。

### 4.1 Orchestrator（工作流编排）

- 工作流状态机：需求 → 方案 → 任务 → Review
- 门禁机制：关键节点暂停等待人工确认 ✋
- 多 AgentEngine 实例调度（并行 + 依赖排序）
- Agent 间数据传递：output_summary + artifacts

### 4.2 任务模式（vs 对话模式）

| | 对话模式（MVP） | 任务模式（二期） |
|---|---|---|
| 触发 | 用户发消息 | Orchestrator 分发 |
| 交互 | 逐个确认危险操作 | 预授权 |
| 输出 | 对话文本 | 结构化产物 |
| 并发 | 单 Agent | 多 Agent 并行 |

### 4.3 Artifact（结构化产物）系统

Agent 通过产物工具输出结构化数据：
- SaveRequirement → 需求文档
- SaveTechDesign → 技术方案 + 任务拆解
- ReportReviewIssue → Review 问题列表
- 产物实时出现在右侧文档面板（三栏布局）

### 4.4 MCP 支持

- 工具接口从第一天 MCP 兼容（MVP 内置工具按 MCP 接口实现）
- 二期开放外部 MCP Server 接入
- Skills 可实现为复合 MCP 工具

### 4.5 Checkpoint / 回滚

- 任务执行前创建 checkpoint（git stash / snapshot）
- 失败后可回滚
- 用户可手动恢复

### 4.6 文件锁与并发

- 多 Agent 并行执行时的文件锁机制
- 冲突时排队等待
- 文件变更追踪

### 4.7 Git 工具

- GitDiff / GitCommit / GitStatus
- CoCode 任务执行后自动 commit
- Review 时 diff 分析

---

## 五、MVP 范围

### 包含
- 首页（基础 Agent 对话）+ 设置（供应商/Agent/Skill/外观）
- 唯一内置 Agent：通用助手（全部工具，无 Skill，默认 Agent）
- Agent 组装层（Cold Assembly + Hot Injection，见 3.18）
- AgentEngine 对话模式（执行循环 + AbortController + Turn Finalize，见 3.2）
- 对话入口（新建 + 恢复，收敛到统一流程，见 3.19）
- 内置工具（File/Bash/Web/Grep/Glob）+ 权限分级（auto/confirm/deny）
- Confirm 级工具审批流程（Promise 暂停 + IPC 审批卡片，见 3.20）
- 多模型支持（Vercel AI SDK）
- 完整记忆系统（四层全部实现）
  - 短期记忆：上下文压缩
  - 情节记忆：对话结束后异步提取（summary / decision / fact / preference）
  - 语义记忆：跨对话积累的项目知识和用户偏好
  - 程序记忆：规范注入（静态）+ 执行模式提取（动态）
  - 记忆注入：每条消息时按相关性 + 优先级 + token 预算注入（Hot Injection）
  - 记忆衰减：未召回的自动衰减，高频召回的持久保留
  - 去重合并：新记忆与已有记忆的自动去重
- 错误恢复（工具错误 → 模型自愈，模型 API → 3 次退避重试，见 3.9）
- 循环内 Context 溢出保护（90% 阈值 + 优雅退出总结，见 3.21）
- Token 用量追踪（per-turn 累加 + token_usage 表 + 事件传递，见 3.22）

### 不包含
- 专业 Agent（前端开发、后端开发、架构师、代码审查、AI PM）及其 Skills
- Rules 独立实体（MVP 中约束直接写在 Agent 的 role_prompt 中，二期再独立为 CRUD 体系）
- Project 空间 / CoCode 工作流
- Orchestrator / 任务调度
- Artifact 系统
- MCP 外部接入
- Skills 复合工具执行（MVP 中 Skill 展开为 prompt）
- 多 Agent 并行
- Checkpoint / 回滚

### 验证目标
通用助手 Agent 在记忆系统 + 工具调用下，对话质量和编码效率是否比裸调模型更好？

---

## 六、参考项目

| 项目 | 参考内容 |
|---|---|
| OpenCode (anomalyco/opencode) | 工具实现、Session 管理、消息压缩、Prompt 组装 |
| Claude Desktop | Electron 架构参考 |
| Claude Code | Agent 执行循环、工具系统、权限模型、streaming 设计 |
