import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'

let db: Database.Database | null = null

function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'coco.db')
}

function getSchemaPath(): string {
  // In dev: resolve from source; in prod: resolve from resources
  if (app.isPackaged) {
    return join(process.resourcesPath, 'schema.sql')
  }
  // Dev mode: schema.sql is next to this file in source, but at build time
  // we need to read from the original source location
  return join(__dirname, '../../electron/data/schema.sql')
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  const dbDir = join(dbPath, '..')

  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)

  // Enable WAL mode and foreign keys
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run schema migration
  migrateSchema(db)

  return db
}

function migrateSchema(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db)

  if (currentVersion === 0) {
    // Fresh database: apply full schema
    const schemaPath = getSchemaPath()
    const schemaSql = readFileSync(schemaPath, 'utf-8')
    db.exec(schemaSql)
    console.log('[DB] Schema v1 applied')
  }

  // Future migrations go here:
  // if (currentVersion < 2) { applyMigrationV2(db) }
}

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare(
      "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
    ).get() as { version: number } | undefined
    return row?.version ?? 0
  } catch {
    // schema_version table doesn't exist yet
    return 0
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[DB] Database closed')
  }
}
