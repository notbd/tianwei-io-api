import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getEnv } from '@/env'
import * as schema from './schema'

// ---------------------------------------------------------------------------
// Database Connection Pool
// ---------------------------------------------------------------------------
// Maintains a singleton database connection pool.
// - Development: connects to local Docker Postgres or remote db (configurable)
// - Production: always connects to remote db (DATABASE_URL from platform secrets)
// ---------------------------------------------------------------------------

let cached: {
  db: NodePgDatabase<typeof schema> | null
  pool: Pool | null
} = { db: null, pool: null }

export async function getDB(): Promise<NodePgDatabase<typeof schema>> {
  if (cached.db) {
    return cached.db
  }

  try {
    const env = getEnv()

    const pool = new Pool({
      connectionString: env.DATABASE_URL,
    })

    const db = drizzle(pool, { schema })
    cached = { db, pool }

    return db
  }
  catch (err) {
    console.error('Failed to initialize database connection:', err)
    throw new Error('Database connection error')
  }
}

export async function closeDB(): Promise<void> {
  try {
    if (cached.pool) {
      await cached.pool.end()
      cached.pool = null
    }
    cached.db = null
  }
  catch (err) {
    console.warn('Error closing database pool:', err)
  }
}

export async function getPool(): Promise<Pool | null> {
  if (!cached.pool) {
    await getDB()
  }
  return cached.pool
}
