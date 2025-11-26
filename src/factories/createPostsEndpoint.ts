import type { fetchPostsConfig } from '@/lib/posts'
import { Hono } from 'hono'
import { fetchPosts } from '@/lib/posts'

/**
 * Creates a Hono router that serves posts based on configuration.
 * Used for both /api/posts (public) and /api/__dev/posts (dev).
 */
export function createPostsEndpoint(config: fetchPostsConfig = {}) {
  const router = new Hono()

  // GET /posts
  router.get('/posts', async (c) => {
    try {
      const rows = await fetchPosts(config)
      return c.json({
        status: 'success',
        count: rows.length,
        data: rows,
      })
    }
    catch (err) {
      console.error('Error fetching posts:', err)
      return c.json(
        { status: 'error', message: 'Failed to fetch posts.' },
        500,
      )
    }
  })

  return router
}
