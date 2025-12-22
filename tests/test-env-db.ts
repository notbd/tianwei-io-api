/**
 * Environment and Database Connection Test
 *
 * Tests that:
 * 1. Environment variables are loaded and validated correctly
 * 2. Database connection can be established (using DATABASE_URL)
 * 3. Basic query execution works
 *
 * Usage:
 *   pnpm test:env-db
 */

import process from 'node:process'
import { closeDB, getPool } from '../src/db/connector'
import { getEnv } from '../src/env'

function maskUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')
}

async function main() {
  console.info('='.repeat(60))
  console.info('Environment and Database Connection Test')
  console.info('='.repeat(60))

  // Step 1: Test environment loading
  console.info('\n[1/3] Testing environment loader...')
  let env
  try {
    env = getEnv()
    console.info('  [OK] Environment variables loaded')
    console.info(`       NODE_ENV: ${env.NODE_ENV}`)
    console.info(`       PORT: ${env.PORT}`)
    console.info(`       DATABASE_URL: ${maskUrl(env.DATABASE_URL)}`)

    if (env.DATABASE_URL_REMOTE) {
      console.info(`       DATABASE_URL_REMOTE: ${maskUrl(env.DATABASE_URL_REMOTE)}`)
    }
    else {
      console.info('       DATABASE_URL_REMOTE: (not configured)')
    }

    if (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0) {
      console.info(`       ALLOWED_ORIGINS: ${env.ALLOWED_ORIGINS.join(', ')}`)
    }
    else {
      console.info('       ALLOWED_ORIGINS: (not configured, CORS disabled)')
    }
  }
  catch (err) {
    console.error('  [FAIL] Environment loading failed')
    console.error(`         ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  // Step 2: Test database connection
  console.info('\n[2/3] Testing database connection...')
  let pool
  try {
    pool = await getPool()
    if (!pool) {
      throw new Error('Pool is null after initialization')
    }
    console.info('  [OK] Database pool initialized')
  }
  catch (err) {
    console.error('  [FAIL] Database connection failed')
    console.error(`         ${err instanceof Error ? err.message : err}`)
    await closeDB()
    process.exit(2)
  }

  // Step 3: Test query execution
  console.info('\n[3/3] Testing query execution (SELECT 1)...')
  try {
    const result = await pool.query('SELECT 1 AS ok')
    if (result.rows[0]?.ok !== 1) {
      throw new Error('Unexpected query result')
    }
    console.info('  [OK] Query executed successfully')
  }
  catch (err) {
    console.error('  [FAIL] Query execution failed')
    console.error(`         ${err instanceof Error ? err.message : err}`)
    await closeDB()
    process.exit(3)
  }

  // Cleanup
  await closeDB()

  console.info(`\n${'='.repeat(60)}`)
  console.info('All tests passed!')
  console.info('='.repeat(60))
}

main()
