import type { AppEnv } from '@/context'
import { Hono } from 'hono'
import { apiRes, failWith } from '@/lib/responses'
import { validSlug } from '@/lib/validation'

/** Public reads: published posts only. Mounted at /api. */
const postsRoutes = new Hono<AppEnv>()

postsRoutes.get('/posts', async (c) => {
  const posts = await c.get('repo').fetchPosts().catch(failWith('Failed to fetch posts.'))
  return apiRes.list(c, posts)
})

postsRoutes.get('/categories', async (c) => {
  const categories = await c.get('repo').fetchCategories().catch(failWith('Failed to fetch categories.'))
  return apiRes.list(c, categories)
})

postsRoutes.get('/post/:slug', validSlug, async (c) => {
  const { slug } = c.req.valid('param')
  const post = await c.get('repo').fetchPostBySlug(slug).catch(failWith('Failed to fetch post.'))
  return post
    ? apiRes.ok(c, post)
    : apiRes.err(c, 'Post not found.', 404)
})

export default postsRoutes
