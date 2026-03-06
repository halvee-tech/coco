import { getDatabase } from '../database'
import type { Memory, MemoryScope, MemoryType } from '../types'
import { genId, now } from '../utils'

export function createMemory(data: Pick<Memory, 'scope' | 'type' | 'content'> & Partial<Memory>): Memory {
  const db = getDatabase()
  const id = data.id ?? genId()
  db.prepare(
    `INSERT INTO memories (id, scope, scope_id, type, content, relevance_score, recall_count, source_message_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.scope, data.scope_id ?? null, data.type, data.content,
    data.relevance_score ?? 1.0, data.recall_count ?? 0,
    data.source_message_id ?? null, now(), data.expires_at ?? null
  )
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Memory
}

export function getMemory(id: string): Memory | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Memory | undefined
}

/**
 * Search memories by keyword matching (SQL LIKE).
 * MVP retrieval strategy - vector search deferred to phase 2.
 */
export function searchMemories(
  query: string,
  scope: MemoryScope,
  scopeId?: string,
  limit: number = 10
): Memory[] {
  const db = getDatabase()
  const keywords = query.split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return []

  const conditions = keywords.map(() => 'content LIKE ?').join(' AND ')
  const params = keywords.map(k => `%${k}%`)

  let sql = `SELECT * FROM memories WHERE scope = ? AND ${conditions} AND (expires_at IS NULL OR expires_at > datetime('now'))`
  const args: unknown[] = [scope, ...params]

  if (scopeId) {
    sql += ' AND scope_id = ?'
    args.push(scopeId)
  }

  sql += ' ORDER BY relevance_score DESC, created_at DESC LIMIT ?'
  args.push(limit)

  return db.prepare(sql).all(...args) as Memory[]
}

/**
 * Get memories by scope (for injection).
 */
export function getMemoriesByScope(scope: MemoryScope, scopeId?: string, limit: number = 20): Memory[] {
  const db = getDatabase()
  let sql = `SELECT * FROM memories WHERE scope = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
  const args: unknown[] = [scope]

  if (scopeId) {
    sql += ' AND scope_id = ?'
    args.push(scopeId)
  }

  sql += ' ORDER BY relevance_score DESC, created_at DESC LIMIT ?'
  args.push(limit)

  return db.prepare(sql).all(...args) as Memory[]
}

/**
 * Update recall: boost relevance_score to 1.0 and increment recall_count.
 */
export function recordRecall(id: string): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE memories SET relevance_score = 1.0, recall_count = recall_count + 1 WHERE id = ?'
  ).run(id)
}

/**
 * Apply decay to all memories (called on app start + every 24h).
 */
export function applyDecay(): void {
  const db = getDatabase()
  const txn = db.transaction(() => {
    // Standard decay: relevance_score *= 0.95 (except exempt)
    db.prepare(
      `UPDATE memories SET relevance_score = relevance_score * 0.95
       WHERE recall_count < 5
       AND type != 'preference'
       AND scope != 'global'
       AND type != 'decision'`
    ).run()

    // Decision type: slower decay (0.98)
    db.prepare(
      `UPDATE memories SET relevance_score = relevance_score * 0.98
       WHERE type = 'decision' AND recall_count < 5`
    ).run()

    // Mark expired: relevance_score < 0.3 and no expires_at yet
    db.prepare(
      `UPDATE memories SET expires_at = datetime('now', '+7 days')
       WHERE relevance_score < 0.3 AND expires_at IS NULL`
    ).run()

    // Delete physically: expired > 7 days ago
    db.prepare(
      `DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`
    ).run()
  })
  txn()
}

/**
 * Delete memories by scope (for conversation deletion cascade).
 */
export function deleteMemoriesByScope(scope: MemoryScope, scopeId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM memories WHERE scope = ? AND scope_id = ?').run(scope, scopeId)
}

export function updateMemory(id: string, data: Partial<Memory>): void {
  const db = getDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'created_at') continue
    fields.push(`${key} = ?`)
    values.push(value)
  }
  values.push(id)

  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}
