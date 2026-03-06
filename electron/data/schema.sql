-- Coco Database Schema (runtime)
-- All tables created at init, phase-2 tables remain empty until needed.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- 一、模型供应商
-- ============================================================

CREATE TABLE IF NOT EXISTS providers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    api_key     TEXT NOT NULL DEFAULT '',
    base_url    TEXT,
    status      TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
    config      TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provider_models (
    id          TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id    TEXT NOT NULL,
    display_name TEXT,
    capabilities TEXT DEFAULT '[]',
    enabled     INTEGER NOT NULL DEFAULT 1,
    config      TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider_id, model_id)
);

-- ============================================================
-- 二、规范体系（二期）
-- ============================================================

CREATE TABLE IF NOT EXISTS rules (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    layer           TEXT NOT NULL CHECK (layer IN ('global', 'project', 'role', 'task')),
    roles           TEXT DEFAULT '[]',
    level           TEXT NOT NULL DEFAULT 'warning' CHECK (level IN ('error', 'warning', 'info')),
    description     TEXT NOT NULL,
    prompt_inject   TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'deprecated')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 三、Skill 体系
-- ============================================================

CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,
    description TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'builtin' CHECK (type IN ('builtin', 'custom')),
    definition  TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 四、Agent 体系
-- ============================================================

CREATE TABLE IF NOT EXISTS agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'builtin' CHECK (type IN ('builtin', 'custom')),
    provider_id     TEXT REFERENCES providers(id) ON DELETE SET NULL,
    model_id        TEXT,
    role_prompt     TEXT NOT NULL DEFAULT '',
    tools           TEXT DEFAULT '[]',
    memory_scope    TEXT NOT NULL DEFAULT 'conversation' CHECK (memory_scope IN ('conversation', 'project', 'global')),
    context_limit   INTEGER NOT NULL DEFAULT 80000,
    config          TEXT DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    config      TEXT DEFAULT '{}',
    PRIMARY KEY (agent_id, skill_id)
);

CREATE TABLE IF NOT EXISTS agent_rules (
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, rule_id)
);

-- ============================================================
-- 五、会话与消息
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT,
    agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
    working_dir TEXT,
    project_id  TEXT,
    type        TEXT NOT NULL DEFAULT 'chat' CHECK (type IN ('chat', 'task')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'partial', 'cancelled', 'error')),
    tool_calls      TEXT,
    tool_call_id    TEXT,
    model_id        TEXT,
    token_input     INTEGER,
    token_output    INTEGER,
    duration_ms     INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS token_usage (
    id                  TEXT PRIMARY KEY,
    conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider_id         TEXT NOT NULL,
    model_id            TEXT NOT NULL,
    prompt_tokens       INTEGER NOT NULL DEFAULT 0,
    completion_tokens   INTEGER NOT NULL DEFAULT 0,
    model_calls         INTEGER NOT NULL DEFAULT 1,
    tool_calls          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_token_usage_conversation ON token_usage(conversation_id);

-- ============================================================
-- 六、记忆体系
-- ============================================================

CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    scope           TEXT NOT NULL CHECK (scope IN ('conversation', 'project', 'global')),
    scope_id        TEXT,
    type            TEXT NOT NULL CHECK (type IN ('summary', 'decision', 'fact', 'preference')),
    content         TEXT NOT NULL,
    embedding       BLOB,
    relevance_score REAL DEFAULT 1.0,
    recall_count    INTEGER NOT NULL DEFAULT 0,
    source_message_id TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope, scope_id);

CREATE TABLE IF NOT EXISTS execution_patterns (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
    pattern_type    TEXT NOT NULL,
    description     TEXT NOT NULL,
    frequency       INTEGER NOT NULL DEFAULT 1,
    last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 七、用户与设置
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    avatar      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 八、Project 空间（二期）
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    repo_path   TEXT,
    tech_stack  TEXT DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'archived')),
    config      TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_rules (
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, rule_id)
);

CREATE TABLE IF NOT EXISTS requirements (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_progress', 'done', 'cancelled')),
    created_by  TEXT,
    confirmed_by TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tech_designs (
    id              TEXT PRIMARY KEY,
    requirement_id  TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'revision')),
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    confirmed_by    TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id  TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    design_id       TEXT REFERENCES tech_designs(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'success', 'failed', 'cancelled')),
    priority        INTEGER NOT NULL DEFAULT 0,
    depends_on      TEXT DEFAULT '[]',
    result_summary  TEXT,
    error_message   TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT,
    finished_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);

CREATE TABLE IF NOT EXISTS file_locks (
    file_path   TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    locked_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_changes (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path   TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('create', 'modify', 'delete')),
    diff        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_changes_task ON file_changes(task_id);

CREATE TABLE IF NOT EXISTS reviews (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
    summary     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_issues (
    id          TEXT PRIMARY KEY,
    review_id   TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    severity    TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    rule_id     TEXT REFERENCES rules(id) ON DELETE SET NULL,
    file_path   TEXT,
    line_start  INTEGER,
    line_end    INTEGER,
    description TEXT NOT NULL,
    suggestion  TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'ignored', 'issue')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_issues_review ON review_issues(review_id);

CREATE TABLE IF NOT EXISTS issues (
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
-- 九、执行历史（二期）
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_logs (
    id              TEXT PRIMARY KEY,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    action_type     TEXT NOT NULL,
    action_detail   TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked')),
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_task ON execution_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_conversation ON execution_logs(conversation_id);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
