import { describe, expect, it } from 'vitest'
import { createApp } from '@/app'
import { bindings, createFakeRepo, createThrowingRepo } from '../helpers/fake-repo'

// These tests pin the EXACT wire contract the frontend depends on.
// If any expected literal here changes, the frontend contract changes;
// that is a breaking change, not a test to casually update.

// The app is stateless, so these two serve every test; only the tests that
// assert the repo's calls build their own.
const app = createApp({ repo: createFakeRepo().repo })
const failingApp = createApp({
  repo: createThrowingRepo(),
})

describe('/', () => {
  it('returns the greeting as plain text', async () => {
    const res = await app.request('/', {}, bindings())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello from tianwei.io API!')
  })
})

describe('/health', () => {
  it('reports status and environment, and no commit when COMMIT_SHA is unset', async () => {
    const res = await app.request('/health', {}, bindings({ NODE_ENV: 'production' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', env: 'production' })
  })

  it('reports the deployed commit, uncached', async () => {
    const res = await app.request('/health', {}, bindings({ COMMIT_SHA: '0123abc' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', env: 'production', commit: '0123abc' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('/api/posts', () => {
  it('returns published summaries, newest first, in the exact envelope', async () => {
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
          createdAt: '2025-10-23T04:00:00.000Z',
          updatedAt: '2025-11-05T05:00:00.000Z',
        },
        {
          id: 1,
          slug: 'older-post',
          category: 'articles',
          title: 'Older Post',
          description: null,
          author: 'Tianwei Zhang',
          createdAt: '2024-04-15T04:00:00.000Z',
          updatedAt: null,
        },
      ],
    })
  })

  it('sets Cache-Control: no-store (frontend owns the only cache layer)', async () => {
    const res = await app.request('/api/posts', {}, bindings())
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('/api/post/:slug', () => {
  it('returns the full post in the exact envelope', async () => {
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
        createdAt: '2025-10-23T04:00:00.000Z',
        updatedAt: '2025-11-05T05:00:00.000Z',
        isPublished: true,
        content: '# Newer\n\nBody.\n',
      },
    })
  })

  it.each([
    ['a missing post', 'no-such-post'],
    ['an unpublished post (drafts are invisible)', 'draft-post'],
  ])('404s with the exact shape for %s', async (_, slug) => {
    const res = await app.request(`/api/post/${slug}`, {}, bindings())
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
    const res = await app.request(`/api/post/${slug}`, {}, bindings())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      status: 'error',
      message: 'Validation failed: slug - Slug must be lowercase alphanumeric with non-consecutive hyphens',
    })
  })

  it('400s on an over-long slug', async () => {
    const res = await app.request(`/api/post/${'a'.repeat(201)}`, {}, bindings())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      status: 'error',
      message: 'Validation failed: slug - Slug is too long',
    })
  })
})

describe('/api/categories', () => {
  it('returns distinct categories of published posts', async () => {
    const res = await app.request('/api/categories', {}, bindings())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'success',
      count: 1,
      data: ['articles'],
    })
  })
})

describe('a failing data layer', () => {
  it.each([
    ['/api/posts', 'Failed to fetch posts.'],
    ['/api/post/some-post', 'Failed to fetch post.'],
    ['/api/categories', 'Failed to fetch categories.'],
  ])('%s answers the exact 500 shape, uncached', async (path, message) => {
    const res = await failingApp.request(path, {}, bindings())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'error', message })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('/api/__dev/posts', () => {
  it('includes unpublished posts in development', async () => {
    const { repo, calls } = createFakeRepo()
    const res = await createApp({ repo }).request('/api/__dev/posts', {}, bindings({ NODE_ENV: 'development' }))

    expect(res.status).toBe(200)
    const body = await res.json() as { count: number, data: { slug: string }[] }
    expect(body.count).toBe(3)
    expect(body.data.map(row => row.slug)).toContain('draft-post')
    expect(calls.fetchPosts).toEqual([
      { includeDrafts: true },
    ])
  })

  it('answers with the standard 404 shape in production', async () => {
    const { repo, calls } = createFakeRepo()
    const res = await createApp({ repo }).request('/api/__dev/posts', {}, bindings({ NODE_ENV: 'production' }))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
    expect(calls.fetchPosts).toEqual([])
  })

  it('fails CLOSED when NODE_ENV is missing entirely (defaults to production)', async () => {
    // This route exposes drafts; a dropped/typo'd binding must not open it.
    const { repo, calls } = createFakeRepo()
    const res = await createApp({ repo }).request('/api/__dev/posts', {}, {
      DATABASE_URL: 'postgresql://user:pass@example.test/db',
    })

    expect(res.status).toBe(404)
    expect(calls.fetchPosts).toEqual([])
  })
})

describe('unmatched routes', () => {
  it('404s with the standard shape', async () => {
    const res = await app.request('/api/nonexistent', {}, bindings())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ status: 'error', message: 'Not Found' })
  })
})

describe('environment validation', () => {
  it('500s with the uniform error shape on invalid configuration', async () => {
    const res = await app.request('/api/posts', {}, { NODE_ENV: 'production', DATABASE_URL: 'mysql://nope' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ status: 'error', message: 'Internal Server Error' })
    // thrown before the /api/* middleware could set it; onError must add it
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
