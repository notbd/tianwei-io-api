import type { FetchEndpointOptions } from '@neondatabase/serverless'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// ---------------------------------------------------------------------------
// Database Access (Cloudflare Workers)
// ---------------------------------------------------------------------------
// Uses Neon's HTTP driver: each query is a single stateless fetch to Neon's
// proxy: no TCP sockets, no connection pool, nothing to clean up on
// shutdown. Ideal for this API's one-query-per-request, read-only profile.
// ---------------------------------------------------------------------------

/**
 * Common Postgres-flavoured Drizzle type over our schema.
 * Satisfied by both neon-http (production) and PGlite (tests), so query
 * code and the repo layer stay driver-agnostic.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

const driverEndpoint = neonConfig.fetchEndpoint

/**
 * Where the driver sends the queries of a DATABASE_URL with this host. A
 * URL on this machine names the content engine's local database (`pnpm dev`
 * there), which serves Neon's HTTP protocol over plain http on the URL's
 * port; every other host keeps the driver's own endpoint. The match is
 * exact, with no prefix match and no DNS lookup, so a host that merely
 * starts with `localhost` is not local. An IPv6 loopback address is not
 * supported.
 */
export function sqlEndpoint(host: string, port: number | string, options?: FetchEndpointOptions): string {
  if (host === '127.0.0.1' || host === 'localhost')
    return `http://${host}:${port}/sql`
  return typeof driverEndpoint === 'function'
    ? driverEndpoint(host, port, options)
    : driverEndpoint
}

// set once at module load: a pure function of its arguments, no state between requests
neonConfig.fetchEndpoint = sqlEndpoint

const dbCache = new Map<string, Database>()

export function getDB(databaseUrl: string): Database {
  let db = dbCache.get(databaseUrl)
  if (!db) {
    db = drizzle(neon(databaseUrl), { schema })
    dbCache.set(databaseUrl, db)
  }
  return db
}
