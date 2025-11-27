import { Hono } from 'hono'
import { fetchPostBySlug } from '@/lib/posts'

/**
 * /api/post/:slug - Returns one post (full detail including content).
 */
const postRoute = new Hono()

postRoute.get('/post/:slug', async (c) => {
  const slug = c.req.param('slug')

  if (!slug) {
    return c.json(
      {
        status: 'error',
        message: 'Slug parameter is required.',
      },
      400,
    )
  }

  try {
    const post = await fetchPostBySlug(slug)

    if (!post) {
      return c.json(
        {
          status: 'error',
          message: 'Post not found.',
        },
        404,
      )
    }

    return c.json(
      {
        status: 'success',
        data: post,
      },
    )
  }
  catch (err) {
    console.error('Error fetching post:', err)
    return c.json(
      {
        status: 'error',
        message: 'Failed to fetch post.',
      },
      500,
    )
  }
})

export default postRoute
