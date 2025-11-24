import { Pool } from 'pg'
import postgres from 'postgres'
import { getEnv } from '@/env'
import * as schema from './schema'

let cached: {
  db: any | null
  pool?: Pool
  sql?: any
} = { db: null }

export async function getDB() {
  if (cached.db)
    return cached.db

  const env = await getEnv()

  if (env.DEPLOYMENT_ENV === 'dev') {
    // dev
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
    })
    const db = drizzle(pool, { schema })
    cached = { db, pool }
    return db
  }
  else {
    // prod
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const sql = postgres(env.DATABASE_URL, { ssl: 'require' })
    const db = drizzle(sql, { schema })
    cached = { db, sql }
    return db
  }
}

export async function closeDB() {
  if (cached.pool) {
    await cached.pool.end()
    cached.pool = undefined
  }
  if (cached.sql) {
    await cached.sql.end?.()
    cached.sql = undefined
  }
  cached.db = null
}

export async function getPool(): Promise<Pool | undefined> {
  if (!cached.pool) {
    await getDB()
  }
  return cached.pool
}
