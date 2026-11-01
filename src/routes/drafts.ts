import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '@/context'
import { Hono } from 'hono'
import { apiRes, failWith } from '@/lib/responses'
import { validSlug } from '@/lib/validation'

/**
 * Reads that include unpublished posts. Mounted at /api. Each answers the
 * standard 404 unless it is enabled, so from outside a disabled route is
 * indistinguishable from one that does not exist.
 */
const draftsRoutes = new Hono<AppEnv>()

// Development only (NODE_ENV defaults to production, so it fails closed).
draftsRoutes.get('/__dev/posts', async (c) => {
  if (c.get('env').NODE_ENV !== 'development')
    return c.notFound()
  const posts = await c.get('repo').fetchPosts({ ignorePublishStatus: true }).catch(failWith('Failed to fetch posts.'))
  return apiRes.list(c, posts)
})

/**
 * Enabled by PREVIEW_SECRET; requires `Authorization: Bearer <secret>`.
 * Runs before slug validation: a disabled route must not leak a 400, and an
 * unauthorized request does no other work.
 */
const previewAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secret = c.get('env').PREVIEW_SECRET
  if (secret === undefined)
    return c.notFound()
  // whole-header comparison: a case-sensitive "Bearer" scheme, fine for the one Next.js client
  if (!(await safeEqual(c.req.header('authorization') ?? '', `Bearer ${secret}`)))
    return apiRes.err(c, 'Unauthorized', 401)
  await next()
}

draftsRoutes.get('/__preview/post/:slug', previewAuth, validSlug, async (c) => {
  const { slug } = c.req.valid('param')
  const post = await c.get('repo').fetchPostBySlug(slug, { ignorePublishStatus: true }).catch(failWith('Failed to fetch post.'))
  return post
    ? apiRes.ok(c, post)
    : apiRes.err(c, 'Post not found.', 404)
})

/**
 * Constant-time equality. Both strings are hashed first so the comparison
 * always runs over two equal-length digests; returning early on a length
 * mismatch would leak the secret's length.
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

export default draftsRoutes
