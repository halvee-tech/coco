import { getDatabase } from '../database'
import type { Provider, ProviderModel } from '../types'
import { genId, now } from '../utils'

// ---- Provider CRUD ----

export function listProviders(): Provider[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as Provider[]
}

export function getProvider(id: string): Provider | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
}

export function createProvider(data: Pick<Provider, 'name' | 'type' | 'api_key'> & Partial<Provider>): Provider {
  const db = getDatabase()
  const id = data.id ?? genId()
  const ts = now()
  db.prepare(
    `INSERT INTO providers (id, name, type, api_key, base_url, status, config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.name, data.type, data.api_key, data.base_url ?? null, data.status ?? 'disconnected', data.config ?? '{}', ts, ts)
  return getProvider(id)!
}

export function updateProvider(id: string, data: Partial<Provider>): Provider | undefined {
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

  db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getProvider(id)
}

export function deleteProvider(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}

// ---- Provider Models ----

export function listProviderModels(providerId: string): ProviderModel[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM provider_models WHERE provider_id = ? ORDER BY created_at').all(providerId) as ProviderModel[]
}

export function createProviderModel(data: Pick<ProviderModel, 'provider_id' | 'model_id'> & Partial<ProviderModel>): ProviderModel {
  const db = getDatabase()
  const id = data.id ?? genId()
  db.prepare(
    `INSERT INTO provider_models (id, provider_id, model_id, display_name, capabilities, enabled, config, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.provider_id, data.model_id, data.display_name ?? null, data.capabilities ?? '[]', data.enabled ?? 1, data.config ?? '{}', now())
  return db.prepare('SELECT * FROM provider_models WHERE id = ?').get(id) as ProviderModel
}

export function deleteProviderModels(providerId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM provider_models WHERE provider_id = ?').run(providerId)
}
