import type { WorkerBindings } from '@/env'
import { describe, expect, it } from 'vitest'
import { createApp } from '@/app'
import { bindings, createFakeRepo } from '../helpers/fake-repo'

const SECRET = 'a-preview-secret-of-sufficient-length'

const app = createApp({ repo: createFakeRepo().repo })

function previewBindings(overrides: Partial<WorkerBindings> = {}) {
  return bindings({ PREVIEW_SECRET: SECRET, ...overrides })
}

describe('/api/__preview/post/:slug', () => {
  it('behaves as a standard 404 when PREVIEW_SECRET is not configured', async () => {
    const res = await app.request('/api/__preview/post/draft-post', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, bindings()) // no PREVIEW_SECRET binding
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
  })

  it.each(['', 'fifteen-chars!!'])('only disables preview when PREVIEW_SECRET is invalid (%j), never the public API', async (secret) => {
    const env = bindings({ PREVIEW_SECRET: secret })

    expect((await app.request('/api/posts', {}, env)).status).toBe(200)
    const preview = await app.request('/api/__preview/post/draft-post', {
      headers: { Authorization: `Bearer ${secret}` },
    }, env)
    expect(preview.status).toBe(404)
    expect(await preview.json()).toEqual({ status: 'error', message: 'Not Found' })
  })

  it('404s (not 400) for invalid slugs while disabled: indistinguishable from absent', async () => {
    // A validation 400 would leak the route's existence to scanners.
    const res = await app.request('/api/__preview/post/BAD_SLUG', {}, bindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
  })

  it.each([
    ['no token', {}],
    [
      'a wrong token',
      { Authorization: 'Bearer wrong-token-wrong-token' },
    ],
    [
      'a token one character longer than the secret',
      { Authorization: `Bearer ${SECRET}x` },
    ],
    [
      'a token one character shorter than the secret',
      { Authorization: `Bearer ${SECRET.slice(0, -1)}` },
    ],
  ])('401s with the exact shape for %s', async (_, headers) => {
    const res = await app.request('/api/__preview/post/draft-post', { headers }, previewBindings())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ status: 'error', message: 'Unauthorized' })
  })

  it('returns unpublished posts with a valid token', async () => {
    const res = await app.request('/api/__preview/post/draft-post', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, previewBindings())

    expect(res.status).toBe(200)
    const body = await res.json() as { status: string, data: { slug: string, isPublished: boolean } }
    expect(body.status).toBe('success')
    expect(body.data.slug).toBe('draft-post')
    expect(body.data.isPublished).toBe(false)
  })

  it('404s for a missing slug even when authorized', async () => {
    const res = await app.request('/api/__preview/post/no-such-post', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, previewBindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Post not found.' })
  })

  it('validates the slug shape once the token is accepted', async () => {
    const res = await app.request('/api/__preview/post/BAD_SLUG', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, previewBindings())
    expect(res.status).toBe(400)
  })

  it('401s (not 400) for an invalid slug with a wrong token: auth runs first', async () => {
    const res = await app.request('/api/__preview/post/BAD_SLUG', {
      headers: { Authorization: 'Bearer wrong-token-wrong-token' },
    }, previewBindings())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ status: 'error', message: 'Unauthorized' })
  })
})
