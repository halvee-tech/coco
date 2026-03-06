import { getDatabase } from '../database'
import type { Skill } from '../types'
import { genId, now } from '../utils'

export function listSkills(): Skill[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM skills WHERE status = ? ORDER BY created_at').all('active') as Skill[]
}

export function getSkill(id: string): Skill | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Skill | undefined
}

export function createSkill(data: Pick<Skill, 'name' | 'category' | 'description'> & Partial<Skill>): Skill {
  const db = getDatabase()
  const id = data.id ?? genId()
  const ts = now()
  db.prepare(
    `INSERT INTO skills (id, name, category, description, type, definition, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.name, data.category, data.description, data.type ?? 'custom', data.definition ?? '{}', data.status ?? 'active', ts, ts)
  return getSkill(id)!
}

export function updateSkill(id: string, data: Partial<Skill>): Skill | undefined {
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

  db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getSkill(id)
}

export function deleteSkill(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM skills WHERE id = ?').run(id)
}
