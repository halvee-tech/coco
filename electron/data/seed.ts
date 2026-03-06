import { getDatabase } from './database'
import * as agentRepo from './repositories/agent.repo'
import * as settingsRepo from './repositories/settings.repo'

const DEFAULT_AGENT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Initialize built-in data on first run.
 * Safe to call multiple times (uses INSERT OR IGNORE / checks existence).
 */
export function seedBuiltinData(): void {
  const db = getDatabase()

  // 1. Default Agent: 通用助手
  const existing = agentRepo.getAgent(DEFAULT_AGENT_ID)
  if (!existing) {
    agentRepo.createAgent({
      id: DEFAULT_AGENT_ID,
      name: '通用助手',
      type: 'builtin',
      role_prompt: '你是一个通用 AI 助手。请用简洁、准确的方式回答问题，必要时提供代码示例。',
      tools: JSON.stringify([
        'FileRead', 'FileWrite', 'FileEdit', 'FileDelete',
        'Grep', 'Glob', 'DirList', 'Bash', 'WebFetch'
      ]),
      memory_scope: 'global',
      context_limit: 200000,
      config: JSON.stringify({ temperature: 0.7 }),
      status: 'active'
    })
    console.log('[Seed] Default agent created: 通用助手')
  }

  // 2. Default settings
  const defaults: Record<string, string> = {
    theme: 'system',
    language: 'zh-CN',
    default_agent_id: DEFAULT_AGENT_ID
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (settingsRepo.getSetting(key) === null) {
      settingsRepo.setSetting(key, value)
    }
  }

  console.log('[Seed] Built-in data initialized')
}
