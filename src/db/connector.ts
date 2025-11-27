import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getEnv } from '@/env'
import * as schema from './schema'

let cached: {
  db: NodePgDatabase<typeof schema> | null
  pool?: Pool
} = { db: null }

export async function getDB() {
  if (cached.db)
    return cached.db

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

export async function closeDB() {
  try {
    if (cached.pool) {
      await cached.pool.end()
      cached.pool = undefined
    }
    cached.db = null
  }
  catch (err) {
    console.warn('Error closing database pool:', err)
  }
}

export async function getPool(): Promise<Pool | undefined> {
  if (!cached.pool) {
    await getDB()
  }
  return cached.pool
}
