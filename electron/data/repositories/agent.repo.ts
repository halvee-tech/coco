import { getDatabase } from '../database'
import type { Agent, AgentSkill } from '../types'
import { genId, now } from '../utils'

export function listAgents(): Agent[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM agents WHERE status = ? ORDER BY created_at').all('active') as Agent[]
}

export function getAgent(id: string): Agent | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined
}

export function createAgent(data: Pick<Agent, 'name'> & Partial<Agent>): Agent {
  const db = getDatabase()
  const id = data.id ?? genId()
  const ts = now()
  db.prepare(
    `INSERT INTO agents (id, name, type, provider_id, model_id, role_prompt, tools, memory_scope, context_limit, config, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.name, data.type ?? 'custom', data.provider_id ?? null, data.model_id ?? null,
    data.role_prompt ?? '', data.tools ?? '[]', data.memory_scope ?? 'conversation',
    data.context_limit ?? 80000, data.config ?? '{}', data.status ?? 'active', ts, ts
  )
  return getAgent(id)!
}

export function updateAgent(id: string, data: Partial<Agent>): Agent | undefined {
  const db = getDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'created_at') continue
    fields.push(`${key} = ?`)
    values.push(value)
  }
  fields.push('updated_at = ?')
  values.push(now())
  values.push(id)

  db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getAgent(id)
}

export function deleteAgent(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

// ---- Agent Skills ----

export function getAgentSkills(agentId: string): AgentSkill[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM agent_skills WHERE agent_id = ?').all(agentId) as AgentSkill[]
}

export function setAgentSkills(agentId: string, skillIds: string[]): void {
  const db = getDatabase()
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM agent_skills WHERE agent_id = ?').run(agentId)
    const insert = db.prepare('INSERT INTO agent_skills (agent_id, skill_id) VALUES (?, ?)')
    for (const skillId of skillIds) {
      insert.run(agentId, skillId)
    }
  })
  txn()
}
