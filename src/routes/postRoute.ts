import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDB } from '@/db/connector'
import { posts } from '@/db/schema'

/**
 * /api/post/:slug - Returns one post (full detail including content).
 */
const postRoute = new Hono()

postRoute.get('/post/:slug', async (c) => {
  const slug = c.req.param('slug')

  if (!slug) {
    return c.json({
      status: 'error',
      message: 'Slug argument missing.',
    }, 400)
  }

  try {
    const db = await getDB()

    const result = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, slug))
      .limit(1)

    const post = result[0]

    if (!post || !post.isPublished) {
      return c.json({
        status: 'error',
        message: 'Post not found.',
      }, 404)
    }

    return c.json({
      status: 'success',
      data: post,
    })
  }
  catch (err) {
    console.error('Error fetching post:', err)
    return c.json({
      status: 'error',
      message: 'Failed to fetch post.',
    }, 500)
  }
})

export default postRoute
