-- ============================================================
-- Coco Database Schema v1.0
-- 技术栈：SQLite（纯客户端）
-- 范围：MVP 一期（对话 + 设置）+ 二期预留（CoCode 工作流）
-- 策略：所有表（含二期）在 MVP 建库时一次性创建，二期表为空表预留
-- SQLite FK 约束在 DML 时检查，DDL 时不报错，因此二期表可安全预建
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- 一、模型供应商
-- ============================================================

CREATE TABLE providers (
    id          TEXT PRIMARY KEY,           -- uuid
    name        TEXT NOT NULL,              -- e.g. "Anthropic", "OpenAI"
    type        TEXT NOT NULL,              -- SDK 类型: "anthropic", "openai", "google", "openai-compatible"
    api_key     TEXT NOT NULL DEFAULT '',   -- AES-256-GCM 加密存储（iv:tag:encrypted）
    base_url    TEXT,                       -- 自定义 endpoint（openai-compatible 必填）
    status      TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
    config      TEXT DEFAULT '{}',          -- JSON，供应商级别额外配置
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE provider_models (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id    TEXT NOT NULL,              -- e.g. "claude-sonnet-4-5"
    display_name TEXT,                      -- 展示名
    capabilities TEXT DEFAULT '[]',         -- JSON array: ["chat", "vision", "tool_use"]
    enabled     INTEGER NOT NULL DEFAULT 1, -- 1=启用, 0=禁用（Agent 配置时只能选启用的模型）
    config      TEXT DEFAULT '{}',          -- 模型级别配置（max_tokens, temperature 等默认值，可覆盖 ModelProfile）
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider_id, model_id)
);

-- ============================================================
-- 二、规范体系（二期：MVP 中约束直接写在 Agent 的 role_prompt 中）
-- ============================================================

CREATE TABLE rules (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    layer           TEXT NOT NULL CHECK (layer IN ('global', 'project', 'role', 'task')),
    roles           TEXT DEFAULT '[]',      -- JSON array: ["frontend", "backend"]
    level           TEXT NOT NULL DEFAULT 'warning' CHECK (level IN ('error', 'warning', 'info')),
    description     TEXT NOT NULL,          -- 给人看的描述
    prompt_inject   TEXT NOT NULL,          -- 给 AI 注入的精简指令
    version         INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'deprecated')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 三、Skill 体系
-- ============================================================

CREATE TABLE skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,              -- "前端", "后端", "架构", "Review", "通用"
    description TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'builtin' CHECK (type IN ('builtin', 'custom')),
    definition  TEXT NOT NULL DEFAULT '{}', -- JSON：结构化定义（parameters / steps / output_format / recommended_tools）
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 四、Agent 体系
-- ============================================================

CREATE TABLE agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'builtin' CHECK (type IN ('builtin', 'custom')),
    provider_id     TEXT REFERENCES providers(id) ON DELETE SET NULL,
    model_id        TEXT,                   -- 引用 provider_models.model_id
    role_prompt     TEXT NOT NULL DEFAULT '',
    tools           TEXT DEFAULT '[]',      -- JSON array: ["FileRead", "FileWrite", ...]
    memory_scope    TEXT NOT NULL DEFAULT 'conversation' CHECK (memory_scope IN ('conversation', 'project', 'global')),
    context_limit   INTEGER NOT NULL DEFAULT 80000,
    config          TEXT DEFAULT '{}',      -- JSON，额外配置（temperature 等覆盖）
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent 绑定的 Skills（静态绑定，创建时配置）
CREATE TABLE agent_skills (
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    config      TEXT DEFAULT '{}',          -- JSON，Agent 级参数覆盖（覆盖 skill.definition 中的 parameters 默认值）
    PRIMARY KEY (agent_id, skill_id)
);

-- Agent 绑定的规范（二期：MVP 不使用）
CREATE TABLE agent_rules (
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, rule_id)
);

-- ============================================================
-- 五、会话与消息（一期核心）
-- ============================================================

CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT,                       -- 自动生成或用户修改
    agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
    working_dir TEXT,                       -- 工作目录（用户选择，恢复对话时需要）
    project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,  -- 二期关联
    type        TEXT NOT NULL DEFAULT 'chat' CHECK (type IN ('chat', 'task')),  -- chat=普通对话, task=任务对话
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'partial', 'cancelled', 'error')),
    -- tool use 相关
    tool_calls      TEXT,                   -- JSON，assistant 发起的 tool calls
    tool_call_id    TEXT,                   -- tool 角色消息的 call id
    -- 元数据
    model_id        TEXT,                   -- 实际使用的模型
    token_input     INTEGER,
    token_output    INTEGER,
    duration_ms     INTEGER,               -- 模型响应耗时
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Token 用量追踪（每轮一条记录，与 messages 同事务写入）
CREATE TABLE token_usage (
    id                  TEXT PRIMARY KEY,
    conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider_id         TEXT NOT NULL,
    model_id            TEXT NOT NULL,
    prompt_tokens       INTEGER NOT NULL DEFAULT 0,
    completion_tokens   INTEGER NOT NULL DEFAULT 0,
    model_calls         INTEGER NOT NULL DEFAULT 1,    -- 本轮调用模型次数
    tool_calls          INTEGER NOT NULL DEFAULT 0,    -- 本轮工具调用次数
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_token_usage_conversation ON token_usage(conversation_id);

-- ============================================================
-- 六、记忆体系
-- ============================================================

-- 情节记忆（对话摘要、关键决策）
CREATE TABLE memories (
    id              TEXT PRIMARY KEY,
    scope           TEXT NOT NULL CHECK (scope IN ('conversation', 'project', 'global')),
    scope_id        TEXT,                   -- conversation_id 或 project_id，global 为 NULL
    -- 注意：scope_id 是逻辑外键（多态引用 conversation/project），不设 FK 约束
    -- 删除对话时由 ConversationService 在应用层级联清理 scope='conversation' 的记忆
    type            TEXT NOT NULL CHECK (type IN ('summary', 'decision', 'fact', 'preference')),
    content         TEXT NOT NULL,
    embedding       BLOB,                   -- 向量索引（后续可用 sqlite-vss）
    relevance_score REAL DEFAULT 1.0,       -- 衰减权重
    recall_count    INTEGER NOT NULL DEFAULT 0,  -- 召回次数（>=5 免衰减）
    source_message_id TEXT,                 -- 来源消息
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT                    -- 遗忘机制：过期时间
);

CREATE INDEX idx_memories_scope ON memories(scope, scope_id);

-- 程序记忆（执行历史提炼）
CREATE TABLE execution_patterns (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
    pattern_type    TEXT NOT NULL,          -- "success", "failure", "optimization"
    description     TEXT NOT NULL,
    frequency       INTEGER NOT NULL DEFAULT 1,
    last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 七、用户与设置
-- ============================================================

-- 二期：MVP 为单用户本地应用，用户名/头像存 settings 表
CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    avatar      TEXT,                       -- 头像路径或 base64
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
    key         TEXT PRIMARY KEY,           -- e.g. "theme", "language", "default_agent_id"
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 八、Project 空间（二期 CoCode 工作流）
-- ============================================================

CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    repo_path   TEXT,                       -- 关联的代码仓库本地路径
    tech_stack  TEXT DEFAULT '[]',          -- JSON array
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'archived')),
    config      TEXT DEFAULT '{}',          -- 项目级配置
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 项目级规范绑定（二期：MVP 不使用）
CREATE TABLE project_rules (
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, rule_id)
);

-- 需求
CREATE TABLE requirements (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,              -- 结构化需求内容（Markdown）
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_progress', 'done', 'cancelled')),
    created_by  TEXT,                       -- user_id 或 agent_id
    confirmed_by TEXT,                      -- 人工确认者
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 技术方案
CREATE TABLE tech_designs (
    id              TEXT PRIMARY KEY,
    requirement_id  TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,          -- 技术方案内容（Markdown）
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'revision')),
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,  -- 生成此方案的 Agent
    confirmed_by    TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 任务
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id  TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    design_id       TEXT REFERENCES tech_designs(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'success', 'failed', 'cancelled')),
    priority        INTEGER NOT NULL DEFAULT 0,  -- 排序优先级
    depends_on      TEXT DEFAULT '[]',      -- JSON array of task_ids
    result_summary  TEXT,                   -- Agent 执行完成后的摘要
    error_message   TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT,
    finished_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_project ON tasks(project_id, status);

-- 文件锁（任务并行执行时防冲突）
CREATE TABLE file_locks (
    file_path   TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    locked_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 文件变更记录
CREATE TABLE file_changes (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path   TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('create', 'modify', 'delete')),
    diff        TEXT,                       -- 变更 diff
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_file_changes_task ON file_changes(task_id);

-- Review
CREATE TABLE reviews (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
    summary     TEXT,                       -- Review 总结
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE review_issues (
    id          TEXT PRIMARY KEY,
    review_id   TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    severity    TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    rule_id     TEXT REFERENCES rules(id) ON DELETE SET NULL,  -- 关联的规范
    file_path   TEXT,
    line_start  INTEGER,
    line_end    INTEGER,
    description TEXT NOT NULL,
    suggestion  TEXT,                       -- 修复建议
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'ignored', 'issue')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_review_issues_review ON review_issues(review_id);

-- Issue（从 Review 转化或手动创建）
CREATE TABLE issues (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    review_issue_id TEXT REFERENCES review_issues(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    description TEXT,
    severity    TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 九、执行历史（审计 + 记忆来源）（二期：MVP 不写入）
-- ============================================================

CREATE TABLE execution_logs (
    id              TEXT PRIMARY KEY,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    action_type     TEXT NOT NULL,          -- "model_call", "tool_use", "file_op", "review"
    action_detail   TEXT NOT NULL DEFAULT '{}',  -- JSON
    status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked')),
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_execution_logs_task ON execution_logs(task_id);
CREATE INDEX idx_execution_logs_conversation ON execution_logs(conversation_id);
