import type { AppEnv } from '@/context'
import type { PostsRepo } from '@/lib/repo'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getDB } from '@/db/connector'
import { parseEnv } from '@/env'
import { createDrizzleRepo } from '@/lib/repo'
import { apiRes } from '@/lib/responses'
import categoriesRoute from '@/routes/categories'
import devPostsRoute from '@/routes/devPosts'
import postRoute from '@/routes/post'
import postsRoute from '@/routes/posts'
import previewPostRoute from '@/routes/previewPost'

export interface CreateAppOptions {
  /** Override the data layer (tests inject fakes here). */
  repo?: PostsRepo
}

/**
 * Build the Worker's Hono app.
 *
 * Note on shape: on Workers there is no boot phase — configuration arrives
 * per request via `c.env` — so everything the Node.js version decided at
 * startup (env validation, CORS on/off, dev-only logging and routes) is
 * decided per request here, memoized where it matters.
 */
export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Context: validate env, wire the data layer
  // -------------------------------------------------------------------------
  app.use('*', async (c, next) => {
    const env = parseEnv(c.env)
    c.set('env', env)
    c.set('repo', options.repo ?? createDrizzleRepo(getDB(env.DATABASE_URL)))
    await next()
  })

  // Request logging (development only for cleaner prod logs)
  app.use('*', async (c, next) => {
    if (c.get('env').NODE_ENV === 'development')
      return logger()(c, next)
    return next()
  })

  // CORS - only applied if ALLOWED_ORIGINS is configured.
  // Server-side requests (SSR) are not affected by CORS.
  app.use('*', async (c, next) => {
    const origins = c.get('env').ALLOWED_ORIGINS
    if (origins.length > 0) {
      return cors({
        origin: origins,
        allowMethods: ['GET', 'HEAD', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
        maxAge: 86400, // 24 hours - browsers cache preflight response
      })(c, next)
    }
    return next()
  })

  // The ONLY cache layer for content is the Next.js frontend (data cache
  // with on-demand revalidation). Any edge/API caching here would serve
  // stale data after a content sync — forbid it explicitly.
  app.use('/api/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  app.get('/', (c) => {
    return c.text('Hello from tianwei.io API!')
  })

  // Health check endpoint for uptime monitoring
  app.get('/health', (c) => {
    return c.json({ status: 'ok', env: c.get('env').NODE_ENV })
  })

  // Public API routes
  app.route('/api', postsRoute)
  app.route('/api', categoriesRoute)
  app.route('/api', postRoute)

  // Development-only route (includes unpublished posts);
  // responds with the standard 404 shape in production.
  app.route('/api/__dev', devPostsRoute)

  // Secret-protected draft preview (enabled only when PREVIEW_SECRET is set)
  app.route('/api/__preview', previewPostRoute)

  // 404 handler
  app.notFound(c => apiRes.err(c, 'Not Found', 404))

  // Uniform 500 shape for anything unhandled (e.g. invalid env config).
  // Errors thrown in middleware skip the /api/* no-store middleware's
  // post-next() header, so set it here too — no 500 may ever be cached.
  app.onError((err, c) => {
    console.error('Unhandled error:', err)
    c.header('Cache-Control', 'no-store')
    return apiRes.err(c, 'Internal Server Error', 500)
  })

  return app
}
