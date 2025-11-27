import type { Env } from '@/env'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { closeDB } from '@/db/connector'
import { getEnv } from '@/env'
import { createPostsEndpoint } from '@/factories/createPostsEndpoint'
import categoriesRoute from '@/routes/categoriesRoute'
import postRoute from '@/routes/postRoute'
import postsRoute from '@/routes/postsRoute'

function main() {
  const env: Env = getEnv()
  const app = new Hono()

  app.get('/', (c) => {
    return c.text('Hello from tianwei.io API!')
  })

  // Public namespace
  app.route('/api', postsRoute)
  app.route('/api', categoriesRoute)
  app.route('/api', postRoute)

  // Dev namespace (mounted only if not in production)
  if (env.DEPLOYMENT_ENV !== 'prod') {
    app.route('/api/__dev', createPostsEndpoint({ ignorePublishStatus: true }))
  }

  app.notFound(c =>
    c.json(
      {
        status: 'error',
        message: 'Not Found',
      },
      404,
    ),
  )

  const server = serve(
    {
      fetch: app.fetch,
      port: env.HONO_PORT,
    },
    (info) => {
      console.info(`Server is running on http://localhost:${info.port}`)
    },
  )

  // Graceful shutdown handlers
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
