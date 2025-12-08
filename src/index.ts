import type { Env } from '@/env'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { closeDB } from '@/db/connector'
import { getEnv, isDev, isProd } from '@/env'
import { createPostsEndpoint } from '@/factories/createPostsEndpoint'
import { apiRes } from '@/lib/responses'
import { rateLimiter } from '@/middleware/rateLimiter'
import categoriesRoute from '@/routes/categoriesRoute'
import postRoute from '@/routes/postRoute'
import postsRoute from '@/routes/postsRoute'

function main() {
  const env: Env = getEnv()
  const app = new Hono()

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  // Request logging (development only for cleaner prod logs)
  if (isDev()) {
    app.use('*', logger())
  }

  // Rate Limiting (100 per ip per hour, prod only)
  if (isProd()) {
    app.use('*', rateLimiter(60 * 60 * 1000, 100))
  }

  // CORS middleware - only applied if ALLOWED_ORIGINS is configured
  // Without this, browsers block client-side requests from different origins.
  // Server-side requests (SSR) are not affected by CORS.
  if (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0) {
    app.use(
      '*',
      cors({
        origin: env.ALLOWED_ORIGINS,
        allowMethods: ['GET', 'HEAD', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge: 86400, // 24 hours - browsers cache preflight response
      }),
    )
    console.info(`CORS enabled for: ${env.ALLOWED_ORIGINS.join(', ')}`)
  }
  else {
    console.info('CORS disabled (ALLOWED_ORIGINS not configured)')
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  // Health check / root endpoint
  app.get('/', (c) => {
    return c.text('Hello from tianwei.io API!')
  })

  // Health check endpoint for deployment platforms
  app.get('/health', (c) => {
    return c.json({ status: 'ok', env: env.NODE_ENV })
  })

  // Public API routes
  app.route('/api', postsRoute)
  app.route('/api', categoriesRoute)
  app.route('/api', postRoute)

  // Development-only routes (includes unpublished posts)
  if (isDev()) {
    app.route('/api/__dev', createPostsEndpoint({ ignorePublishStatus: true }))
  }

  // 404 handler
  app.notFound(c => apiRes.err(c, 'Not Found', 404))

  // ---------------------------------------------------------------------------
  // Server Startup
  // ---------------------------------------------------------------------------

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      console.info(`Server running on http://localhost:${info.port}`)
      console.info(`Environment: ${env.NODE_ENV}`)
    },
  )

  // ---------------------------------------------------------------------------
  // Graceful Shutdown
  // ---------------------------------------------------------------------------

  const shutdown = async () => {
    console.info('Shutting down server...')
    server.close()
    await closeDB()
    console.info('Cleanup complete.')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
