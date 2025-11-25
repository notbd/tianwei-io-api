import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getEnv } from '@/env'
import * as schema from './schema'

let cached: {
  db: any | null
  pool?: Pool
} = { db: null }

export async function getDB() {
  if (cached.db)
    return cached.db

  const env = await getEnv()

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
  })
  const db = drizzle(pool, { schema })
  cached = { db, pool }
  return db
}

export async function closeDB() {
  if (cached.pool) {
    await cached.pool.end()
    cached.pool = undefined
  }
  cached.db = null
}

export async function getPool(): Promise<Pool | undefined> {
  if (!cached.pool) {
    await getDB()
  }
  return cached.pool
}
