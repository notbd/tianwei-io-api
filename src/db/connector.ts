import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schemaShape from './schema'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// ---------------------------------------------------------------------------
// Database Access (Cloudflare Workers)
// ---------------------------------------------------------------------------
// Uses Neon's HTTP driver: each query is a single stateless fetch to Neon's
// proxy — no TCP sockets, no connection pool, nothing to clean up on
// shutdown. Ideal for this API's one-query-per-request, read-only profile.
// ---------------------------------------------------------------------------

/**
 * Common Postgres-flavoured Drizzle type over our schema.
 * Satisfied by both neon-http (production) and PGlite (tests), so query
 * code and the repo layer stay driver-agnostic.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schemaShape>

const dbCache = new Map<string, Database>()

export function getDB(databaseUrl: string): Database {
  let db = dbCache.get(databaseUrl)
  if (!db) {
    db = drizzle(neon(databaseUrl), { schema })
    dbCache.set(databaseUrl, db)
  }
  return db
}
