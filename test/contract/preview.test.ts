import { describe, expect, it } from 'vitest'
import { createApp } from '@/app'
import { bindings, createFakeRepo } from '../helpers/fake-repo'

const SECRET = 'a-preview-secret-of-sufficient-length'

function previewBindings(overrides: Record<string, string> = {}) {
  return bindings({ PREVIEW_SECRET: SECRET, ...overrides })
}

describe('gET /api/__preview/post/:slug', () => {
  it('behaves as a standard 404 when PREVIEW_SECRET is not configured', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/__preview/post/draft-post', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, bindings()) // no PREVIEW_SECRET binding
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
  })

  it('401s without a token', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/__preview/post/draft-post', {}, previewBindings())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ status: 'error', message: 'Unauthorized' })
  })

  it('401s with a wrong token', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/__preview/post/draft-post', {
      headers: { Authorization: 'Bearer wrong-token-wrong-token' },
    }, previewBindings())
    expect(res.status).toBe(401)
  })

  it('returns unpublished posts with a valid token', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
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
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/__preview/post/no-such-post', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, previewBindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Post not found.' })
  })

  it('validates the slug shape before auth-independent work', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/__preview/post/BAD_SLUG', {
      headers: { Authorization: `Bearer ${SECRET}` },
    }, previewBindings())
    expect(res.status).toBe(400)
  })
})
