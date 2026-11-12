import type { AppEnv } from '@/context'
import type { PostsRepo } from '@/lib/repo'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { getDB } from '@/db/connector'
import { parseEnv } from '@/env'
import { createDrizzleRepo } from '@/lib/repo'
import { apiRes } from '@/lib/responses'
import draftsRoutes from '@/routes/drafts'
import postsRoutes from '@/routes/posts'

export type CreateAppOptions = {
  /** Override the data layer (tests inject fakes here). */
  repo?: PostsRepo
}

/**
 * Build the Worker's Hono app.
 *
 * Workers has no boot phase: configuration arrives per request (`c.env`),
 * so env validation, CORS and the dev-only route are decided per request,
 * memoized where it matters.
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
  // stale data after a content sync; forbid it explicitly.
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

  // Health check for uptime monitoring and the deploy's version check.
  // `commit` is omitted when COMMIT_SHA is unset (JSON drops undefined).
  // no-store: a cached answer would let the deploy see a stale commit.
  app.get('/health', (c) => {
    const { NODE_ENV, COMMIT_SHA } = c.get('env')
    c.header('Cache-Control', 'no-store')
    return c.json({ status: 'ok', env: NODE_ENV, commit: COMMIT_SHA })
  })

  app.route('/api', postsRoutes)
  app.route('/api', draftsRoutes)

  app.notFound(c => apiRes.err(c, 'Not Found', 404))

  // Every error lands here: a failed read arrives as an HTTPException that
  // carries its endpoint's public message (failWith), anything else (e.g.
  // invalid env config) gets the generic one. Errors thrown in middleware
  // skip the /api/* no-store middleware's post-next() header, so set it
  // here too: no 500 may ever be cached.
  app.onError((err, c) => {
    console.error(err.message, err.cause ?? err)
    c.header('Cache-Control', 'no-store')
    return err instanceof HTTPException
      ? apiRes.err(c, err.message, err.status)
      : apiRes.err(c, 'Internal Server Error', 500)
  })

  return app
}
