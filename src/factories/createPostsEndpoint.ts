import type { FetchPostsConfig } from '@/lib/posts'
import { Hono } from 'hono'
import { fetchPosts } from '@/lib/posts'
import { apiRes } from '@/lib/responses'

/**
 * Creates a Hono router that serves posts based on configuration.
 * Used for both /api/posts (public) and /api/__dev/posts (dev).
 */
export function createPostsEndpoint(
  config: FetchPostsConfig = {},
) {
  const router = new Hono()

  // GET /posts
  router.get('/posts', async (c) => {
    try {
      const rows = await fetchPosts(config)
      return apiRes.list(c, rows)
    }
    catch (err) {
      console.error('Error fetching posts:', err)
      return apiRes.err(c, 'Failed to fetch posts.', 500)
    }
  })

  return router
}
