import process from 'node:process'
import { closeDB, getDB, getPool } from '@/db/connector'
import { getEnv } from '@/env'

async function main() {
  // Test env loader
  console.info('\n- Running env + db connector test')
  try {
    const env = await getEnv()
    console.info('[✔︎] env loader: ok')
    console.info('  DEPLOYMENT_ENV:', env.DEPLOYMENT_ENV)
    console.info('  DATABASE_URL:', env.DATABASE_URL)
  }
  catch (err: any) {
    console.error('[x] env loader failed:')
    console.error(err?.message ?? err)
    process.exitCode = 2
    return
  }

  // Test db connector - try a minimal query
  console.info('\n- Running a lightweight DB query: SELECT 1')
  try {
    const pool = await getPool()

    if (!pool) {
      throw new Error('  DB/Pool failed to initialize')
    }

    const result = await pool.query('SELECT 1 as ok')
    console.info('[✔︎] db connector: query executed, rows:', result.rows)
  }
  catch (err: any) {
    console.error('[x] db connector failed:')
    console.error(err?.message ?? err)
    process.exitCode = 3
  }
  finally {
    await closeDB()
  }
}

main()
