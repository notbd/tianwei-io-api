import type { AppEnv } from '@/context'
import { Hono } from 'hono'
import { apiRes } from '@/lib/responses'

/**
 * GET /api/__dev/posts - Development-only list including unpublished posts.
 * In production this path answers with the standard 404 shape, exactly as
 * if the route were never mounted (parity with the Node.js version, which
 * skipped mounting it at startup).
 */
const devPostsRoute = new Hono<AppEnv>()

devPostsRoute.get('/posts', async (c) => {
  if (c.get('env').NODE_ENV !== 'development')
    return apiRes.err(c, 'Not Found', 404)

  try {
    const rows = await c.get('repo').fetchPosts({ ignorePublishStatus: true })
    return apiRes.list(c, rows)
  }
  catch (err) {
    console.error('Error fetching posts:', err)
    return apiRes.err(c, 'Failed to fetch posts.', 500)
  }
})

export default devPostsRoute
