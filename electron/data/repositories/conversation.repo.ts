import { getDatabase } from '../database'
import type { Conversation } from '../types'
import { genId, now } from '../utils'

export function listConversations(): Conversation[] {
  const db = getDatabase()
  return db.prepare(
    'SELECT * FROM conversations WHERE status = ? ORDER BY updated_at DESC'
  ).all('active') as Conversation[]
}

export function getConversation(id: string): Conversation | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined
}

export function createConversation(data: Partial<Conversation> = {}): Conversation {
  const db = getDatabase()
  const id = data.id ?? genId()
  const ts = now()
  db.prepare(
    `INSERT INTO conversations (id, title, agent_id, working_dir, type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.title ?? null, data.agent_id ?? null, data.working_dir ?? null, data.type ?? 'chat', 'active', ts, ts)
  return getConversation(id)!
}

export function updateConversation(id: string, data: Partial<Conversation>): Conversation | undefined {
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

  db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getConversation(id)
}

export function deleteConversation(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}
