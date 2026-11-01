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

/**
 * Constant-time equality. Both strings are hashed first so the byte
 * comparison always runs over two equal-length digests — returning early
 * on a length mismatch would leak the secret's length.
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const bytesA = new Uint8Array(digestA)
  const bytesB = new Uint8Array(digestB)
  let diff = 0
  for (let i = 0; i < bytesA.length; i++)
    diff |= bytesA[i]! ^ bytesB[i]!
  return diff === 0
}

previewPostRoute.get(
  '/post/:slug',
  // The disabled state must be indistinguishable from a nonexistent route,
  // so the 404 guard runs BEFORE slug validation (which would leak a 400).
  // Auth lives in the same guard: an unauthorized request does no other work.
  async (c, next) => {
    const secret = c.get('env').PREVIEW_SECRET
    if (secret === undefined)
      return apiRes.err(c, 'Not Found', 404)

    // Whole-header comparison implies a case-sensitive "Bearer" scheme
    // (stricter than RFC 7235) — fine for the single known Next.js client.
    const authHeader = c.req.header('authorization') ?? ''
    if (!(await safeEqual(authHeader, `Bearer ${secret}`)))
      return apiRes.err(c, 'Unauthorized', 401)

    await next()
  },
  zValidator('param', slugParam, validationErrorHook),
  async (c) => {
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
