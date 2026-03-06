import { getDatabase } from '../database'
import type { ExecutionPattern } from '../types'
import { genId, now } from '../utils'

export function createPattern(data: Pick<ExecutionPattern, 'pattern_type' | 'description'> & Partial<ExecutionPattern>): ExecutionPattern {
  const db = getDatabase()
  const id = data.id ?? genId()
  const ts = now()
  db.prepare(
    `INSERT INTO execution_patterns (id, agent_id, pattern_type, description, frequency, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.agent_id ?? null, data.pattern_type, data.description, data.frequency ?? 1, ts, ts)
  return db.prepare('SELECT * FROM execution_patterns WHERE id = ?').get(id) as ExecutionPattern
}

export function incrementPattern(id: string): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE execution_patterns SET frequency = frequency + 1, last_seen_at = ? WHERE id = ?'
  ).run(now(), id)
}

export function getPatternsByAgent(agentId: string): ExecutionPattern[] {
  const db = getDatabase()
  return db.prepare(
    'SELECT * FROM execution_patterns WHERE agent_id = ? ORDER BY frequency DESC'
  ).all(agentId) as ExecutionPattern[]
}
