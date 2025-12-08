/**
 * Remote Database Connection Test
 *
 * Tests connectivity to the production remote database using DATABASE_URL_REMOTE
 * from .env.local.
 *
 * Setup:
 *   1. Add DATABASE_URL_REMOTE to your .env.local with remote db credentials
 *   2. Run: pnpm test:remote-db
 *
 * This is useful for:
 *   - Verifying remote db connection works before deployment
 *   - Testing that production data is correctly synced
 *   - Debugging production database issues locally
 */
import process from 'node:process';
import { Pool } from 'pg';
import { getEnv } from '@/env';
function maskUrl(url) {
    return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}
async function main() {
    console.info('='.repeat(60));
    console.info('Remote Database Connection Test');
    console.info('='.repeat(60));
    // Load configuration
    console.info('\n[1/4] Loading environment configuration...');
    const env = getEnv();
    if (!env.DATABASE_URL_REMOTE) {
        console.error('  [FAIL] DATABASE_URL_REMOTE is not configured');
        console.error('');
        console.error('  Add to your .env.local:');
        console.error('    DATABASE_URL_REMOTE=postgresql://<user>:<pass>@<host>.some-db.com/<db>?sslmode=require');
        process.exit(1);
    }
    console.info(`  [OK] DATABASE_URL_REMOTE: ${maskUrl(env.DATABASE_URL_REMOTE)}`);
    // Create connection pool
    console.info('\n[2/4] Creating connection pool...');
    const pool = new Pool({
        connectionString: env.DATABASE_URL_REMOTE,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });
    try {
        // Test basic connectivity
        console.info('\n[3/4] Testing connection (SELECT 1)...');
        const pingResult = await pool.query('SELECT 1 AS ok');
        if (pingResult.rows[0]?.ok !== 1) {
            throw new Error('Unexpected ping result');
        }
        console.info('  [OK] Connection successful');
        // Test posts table access
        console.info('\n[4/4] Testing posts table access...');
        const postsResult = await pool.query('SELECT COUNT(*) AS count FROM posts');
        const count = Number.parseInt(postsResult.rows[0]?.count ?? '0', 10);
        console.info(`  [OK] Found ${count} posts in remote database`);
        // Show a sample post if available
        if (count > 0) {
            const sampleResult = await pool.query('SELECT slug, title FROM posts LIMIT 1');
            const sample = sampleResult.rows[0];
            console.info(`       Sample: "${sample.title}" (${sample.slug})`);
        }
    }
    catch (err) {
        console.error('  [FAIL] Database operation failed');
        console.error(`         ${err instanceof Error ? err.message : err}`);
        await pool.end();
        process.exit(2);
    }
    // Cleanup
    await pool.end();
    console.info(`\n${'='.repeat(60)}`);
    console.info('Remote database connection verified!');
    console.info('='.repeat(60));
}
main();
