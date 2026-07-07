import type { AppEnv } from '@/context'
import { Hono } from 'hono'
import { apiRes } from '@/lib/responses'

/**
 * GET /api/posts - Public list of posts (summary shape, published only).
 */
const postsRoute = new Hono<AppEnv>()

postsRoute.get('/posts', async (c) => {
  try {
    const rows = await c.get('repo').fetchPosts()
    return apiRes.list(c, rows)
  }
  catch (err) {
    console.error('Error fetching posts:', err)
    return apiRes.err(c, 'Failed to fetch posts.', 500)
  }
})

export default postsRoute
