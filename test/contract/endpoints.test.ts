import { describe, expect, it } from 'vitest'
import { createApp } from '@/app'
import { bindings, createFakeRepo, createThrowingRepo } from '../helpers/fake-repo'

// These tests pin the EXACT wire contract the frontend depends on.
// If any expected literal here changes, the frontend contract changes —
// that is a breaking change, not a test to casually update.

describe('gET /', () => {
  it('returns the greeting as plain text', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/', {}, bindings())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello from tianwei.io API!')
  })
})

describe('gET /health', () => {
  it('reports status and environment', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/health', {}, bindings({ NODE_ENV: 'production' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', env: 'production' })
  })
})

describe('gET /api/posts', () => {
  it('returns published summaries, newest first, in the exact envelope', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {}, bindings())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'success',
      count: 2,
      data: [
        {
          id: 2,
          slug: 'newer-post',
          category: 'articles',
          title: 'Newer Post',
          description: 'The newer one',
          author: 'Tianwei Zhang',
          createdAt: '2025-10-23T00:00:00.000Z',
          updatedAt: '2025-11-05T00:00:00.000Z',
        },
        {
          id: 1,
          slug: 'older-post',
          category: 'articles',
          title: 'Older Post',
          description: null,
          author: 'Tianwei Zhang',
          createdAt: '2024-04-15T00:00:00.000Z',
          updatedAt: null,
        },
      ],
    })
  })

  it('never leaks content or isPublished in the summary shape', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {}, bindings())
    const body = await res.json() as { data: Record<string, unknown>[] }
    for (const row of body.data) {
      expect(row).not.toHaveProperty('content')
      expect(row).not.toHaveProperty('isPublished')
    }
  })

  it('returns the exact 500 shape when the data layer fails', async () => {
    const app = createApp({ repo: createThrowingRepo() })
    const res = await app.request('/api/posts', {}, bindings())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'error', message: 'Failed to fetch posts.' })
  })

  it('sets Cache-Control: no-store (frontend owns the only cache layer)', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {}, bindings())
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('gET /api/post/:slug', () => {
  it('returns the full post in the exact envelope', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/post/newer-post', {}, bindings())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'success',
      data: {
        id: 2,
        slug: 'newer-post',
        category: 'articles',
        title: 'Newer Post',
        description: 'The newer one',
        author: 'Tianwei Zhang',
        createdAt: '2025-10-23T00:00:00.000Z',
        updatedAt: '2025-11-05T00:00:00.000Z',
        isPublished: true,
        content: '# Newer\n\nBody.\n',
      },
    })
  })

  it('404s with the exact shape for a missing post', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/post/no-such-post', {}, bindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Post not found.' })
  })

  it('404s for an unpublished post (drafts are invisible)', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/post/draft-post', {}, bindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Post not found.' })
  })

  it.each([
    'UPPERCASE',
    'has_underscore',
    'double--hyphen',
    '-leading-hyphen',
    'trailing-hyphen-',
    'ends.with.dots',
  ])('400s on invalid slug %j with the exact validation message', async (slug) => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request(`/api/post/${slug}`, {}, bindings())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      status: 'error',
      message: 'Validation failed: slug - Slug must be lowercase alphanumeric with non-consecutive hyphens',
    })
  })

  it('400s on an over-long slug', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request(`/api/post/${'a'.repeat(201)}`, {}, bindings())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      status: 'error',
      message: 'Validation failed: slug - Slug is too long',
    })
  })

  it('returns the exact 500 shape when the data layer fails', async () => {
    const app = createApp({ repo: createThrowingRepo() })
    const res = await app.request('/api/post/some-post', {}, bindings())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'error', message: 'Failed to fetch post.' })
  })
})

describe('gET /api/categories', () => {
  it('returns distinct categories of published posts', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/categories', {}, bindings())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'success',
      count: 1,
      data: ['articles'],
    })
  })

  it('returns the exact 500 shape when the data layer fails', async () => {
    const app = createApp({ repo: createThrowingRepo() })
    const res = await app.request('/api/categories', {}, bindings())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'error', message: 'Failed to fetch categories.' })
  })
})

describe('gET /api/__dev/posts', () => {
  it('includes unpublished posts in development', async () => {
    const { repo, calls } = createFakeRepo()
    const app = createApp({ repo })
    const res = await app.request('/api/__dev/posts', {}, bindings({ NODE_ENV: 'development' }))

    expect(res.status).toBe(200)
    const body = await res.json() as { count: number, data: { slug: string }[] }
    expect(body.count).toBe(3)
    expect(body.data.map(row => row.slug)).toContain('draft-post')
    expect(calls.fetchPosts).toEqual([{ ignorePublishStatus: true }])
  })

  it('answers with the standard 404 shape in production', async () => {
    const { repo, calls } = createFakeRepo()
    const app = createApp({ repo })
    const res = await app.request('/api/__dev/posts', {}, bindings({ NODE_ENV: 'production' }))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
    expect(calls.fetchPosts).toEqual([])
  })
})

describe('unmatched routes', () => {
  it('404s with the standard shape', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/nonexistent', {}, bindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
  })
})

describe('cORS', () => {
  it('is absent when ALLOWED_ORIGINS is empty', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {
      headers: { Origin: 'https://tianwei.io' },
    }, bindings({ ALLOWED_ORIGINS: '' }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('allows configured origins', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {
      headers: { Origin: 'https://tianwei.io' },
    }, bindings({ ALLOWED_ORIGINS: 'https://tianwei.io, https://preview.tianwei.io' }))
    expect(res.headers.get('access-control-allow-origin')).toBe('https://tianwei.io')
  })

  it('rejects unlisted origins', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {
      headers: { Origin: 'https://evil.example' },
    }, bindings({ ALLOWED_ORIGINS: 'https://tianwei.io' }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('environment validation', () => {
  it('500s with the uniform error shape on invalid configuration', async () => {
    const app = createApp({ repo: createFakeRepo().repo })
    const res = await app.request('/api/posts', {}, { NODE_ENV: 'production', DATABASE_URL: 'mysql://nope' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'error', message: 'Internal Server Error' })
  })
})
