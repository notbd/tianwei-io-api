import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { fetchPostBySlug } from '@/lib/posts'
import { apiRes } from '@/lib/responses'
import { validationErrorHook } from '@/lib/validation'
import { slugParam } from '@/schemas'

/**
 * /api/post/:slug - Returns one post (full detail including content).
 */
const postRoute = new Hono()

postRoute.get(
  '/post/:slug',
  zValidator('param', slugParam, validationErrorHook),
  async (c) => {
    const { slug } = c.req.valid('param')

    try {
      const post = await fetchPostBySlug(slug)

      if (!post) {
        return apiRes.err(c, 'Post not found.', 404)
      }

      return apiRes.ok(c, post)
    }
    catch (err) {
      console.error('Error fetching post:', err)
      return apiRes.err(c, 'Failed to fetch post.', 500)
    }
  },
)

export default postRoute
