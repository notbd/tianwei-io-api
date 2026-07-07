import type { AppEnv } from '@/context'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { apiRes } from '@/lib/responses'
import { validationErrorHook } from '@/lib/validation'
import { slugParam } from '@/schemas'

/**
 * GET /api/__preview/post/:slug - Draft preview for the frontend's
 * draftMode: returns the post regardless of publish status.
 *
 * Auth: `Authorization: Bearer <PREVIEW_SECRET>`. When PREVIEW_SECRET is
 * not configured the route answers with the standard 404 shape, exactly
 * as if it did not exist.
 */
const previewPostRoute = new Hono<AppEnv>()

function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const bytesA = encoder.encode(a)
  const bytesB = encoder.encode(b)
  if (bytesA.length !== bytesB.length)
    return false
  let diff = 0
  for (let i = 0; i < bytesA.length; i++)
    diff |= bytesA[i]! ^ bytesB[i]!
  return diff === 0
}

previewPostRoute.get(
  '/post/:slug',
  // The disabled state must be indistinguishable from a nonexistent route,
  // so the 404 guard runs BEFORE slug validation (which would leak a 400).
  async (c, next) => {
    if (c.get('env').PREVIEW_SECRET === undefined)
      return apiRes.err(c, 'Not Found', 404)
    await next()
  },
  zValidator('param', slugParam, validationErrorHook),
  async (c) => {
    // guarded above; re-read for the comparison
    const secret = c.get('env').PREVIEW_SECRET as string

    // Whole-header comparison implies a case-sensitive "Bearer" scheme
    // (stricter than RFC 7235) — fine for the single known Next.js client.
    const authHeader = c.req.header('authorization') ?? ''
    if (!safeEqual(authHeader, `Bearer ${secret}`))
      return apiRes.err(c, 'Unauthorized', 401)

    const { slug } = c.req.valid('param')

    try {
      const post = await c.get('repo').fetchPostBySlug(slug, { ignorePublishStatus: true })

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

export default previewPostRoute
