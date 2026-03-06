// Core data types derived from database-schema.sql
// All id fields are UUIDs (string), timestamps are ISO 8601 strings

// ============================================================
// Provider
// ============================================================

export interface Provider {
  id: string
  name: string
  type: ProviderType
  api_key: string // AES-256-GCM encrypted (iv:tag:encrypted)
  base_url: string | null
  status: 'connected' | 'disconnected'
  config: string // JSON
  created_at: string
  updated_at: string
}

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'openai-compatible'

export interface ProviderModel {
  id: string
  provider_id: string
  model_id: string
  display_name: string | null
  capabilities: string // JSON array: ["chat", "vision", "tool_use"]
  enabled: number // 1=enabled, 0=disabled (SQLite boolean)
  config: string // JSON
  created_at: string
}

// ============================================================
// Skill
// ============================================================

export interface Skill {
  id: string
  name: string
  category: string
  description: string
  type: 'builtin' | 'custom'
  definition: string // JSON: { parameters, steps, output_format, recommended_tools }
  status: 'active' | 'disabled'
  created_at: string
  updated_at: string
}

// ============================================================
// Agent
// ============================================================

export interface Agent {
  id: string
  name: string
  type: 'builtin' | 'custom'
  provider_id: string | null
  model_id: string | null
  role_prompt: string
  tools: string // JSON array: ["FileRead", "FileWrite", ...]
  memory_scope: MemoryScope
  context_limit: number
  config: string // JSON
  status: 'active' | 'disabled'
  created_at: string
  updated_at: string
}

export interface AgentSkill {
  agent_id: string
  skill_id: string
  config: string // JSON
}

// ============================================================
// Conversation & Message
// ============================================================

export interface Conversation {
  id: string
  title: string | null
  agent_id: string | null
  working_dir: string | null
  project_id: string | null
  type: 'chat' | 'task'
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'complete' | 'partial' | 'cancelled' | 'error'

export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  status: MessageStatus
  tool_calls: string | null // JSON
  tool_call_id: string | null
  model_id: string | null
  token_input: number | null
  token_output: number | null
  duration_ms: number | null
  created_at: string
}

// ============================================================
// Token Usage
// ============================================================

export interface TokenUsage {
  id: string
  conversation_id: string
  provider_id: string
  model_id: string
  prompt_tokens: number
  completion_tokens: number
  model_calls: number
  tool_calls: number
  created_at: string
}

// ============================================================
// Memory
// ============================================================

export type MemoryScope = 'conversation' | 'project' | 'global'
export type MemoryType = 'summary' | 'decision' | 'fact' | 'preference'

export interface Memory {
  id: string
  scope: MemoryScope
  scope_id: string | null
  type: MemoryType
  content: string
  embedding: Buffer | null
  relevance_score: number
  recall_count: number
  source_message_id: string | null
  created_at: string
  expires_at: string | null
}

// ============================================================
// Execution Pattern
// ============================================================

export interface ExecutionPattern {
  id: string
  agent_id: string | null
  pattern_type: 'success' | 'failure' | 'optimization'
  description: string
  frequency: number
  last_seen_at: string
  created_at: string
}

// ============================================================
// Settings
// ============================================================

export interface Setting {
  key: string
  value: string
  updated_at: string
}
