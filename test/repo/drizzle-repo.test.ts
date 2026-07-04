import { PGlite } from '@electric-sql/pglite'
import { pushSchema } from 'drizzle-kit/api'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createDrizzleRepo } from '@/lib/repo'

// Exercises the real SQL the repo issues, against an in-memory Postgres.

let client: PGlite
let repo: ReturnType<typeof createDrizzleRepo>

beforeEach(async () => {
  client = new PGlite()
  const db = drizzle(client, { schema })

  const { apply } = await pushSchema(schema, db as never)
  await apply()

  await db.insert(schema.posts).values([
    {
      slug: 'published-old',
      category: 'articles',
      title: 'Old',
      description: null,
      author: 'Tianwei Zhang',
      createdAt: new Date('2024-04-15T00:00:00.000Z'),
      isPublished: true,
      content: 'old content',
    },
    {
      slug: 'published-new',
      category: 'articles',
      title: 'New',
      description: 'newest',
      author: 'Tianwei Zhang',
      createdAt: new Date('2025-10-23T00:00:00.000Z'),
      updatedAt: new Date('2025-11-05T00:00:00.000Z'),
      isPublished: true,
      content: 'new content',
    },
    {
      slug: 'unpublished-draft',
      category: 'notes',
      title: 'Draft',
      description: null,
      author: 'Tianwei Zhang',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      isPublished: false,
      content: 'draft content',
    },
  ])

  repo = createDrizzleRepo(db as never)
})

afterEach(async () => {
  await client.close()
})

describe('fetchPosts', () => {
  it('returns only published posts, newest first, without content/isPublished', async () => {
    const rows = await repo.fetchPosts()
    expect(rows.map(row => row.slug)).toEqual(['published-new', 'published-old'])
    expect(rows[0]).toEqual({
      id: expect.any(Number),
      slug: 'published-new',
      category: 'articles',
      title: 'New',
      description: 'newest',
      author: 'Tianwei Zhang',
      createdAt: new Date('2025-10-23T00:00:00.000Z'),
      updatedAt: new Date('2025-11-05T00:00:00.000Z'),
    })
    // updatedAt is nullable — absent means "never updated"
    expect(rows[1]!.updatedAt).toBeNull()
    expect(rows[0]).not.toHaveProperty('content')
    expect(rows[0]).not.toHaveProperty('isPublished')
  })

  it('includes drafts when ignorePublishStatus is set', async () => {
    const rows = await repo.fetchPosts({ ignorePublishStatus: true })
    expect(rows.map(row => row.slug)).toEqual([
      'unpublished-draft',
      'published-new',
      'published-old',
    ])
  })
})

describe('fetchPostBySlug', () => {
  it('returns the full row for a published slug', async () => {
    const post = await repo.fetchPostBySlug('published-old')
    expect(post).toMatchObject({
      slug: 'published-old',
      title: 'Old',
      description: null,
      isPublished: true,
      content: 'old content',
    })
    expect(post!.createdAt).toEqual(new Date('2024-04-15T00:00:00.000Z'))
  })

  it('returns null for a missing slug', async () => {
    expect(await repo.fetchPostBySlug('nope')).toBeNull()
  })

  it('hides unpublished posts by default, reveals them when asked', async () => {
    expect(await repo.fetchPostBySlug('unpublished-draft')).toBeNull()
    const draft = await repo.fetchPostBySlug('unpublished-draft', { ignorePublishStatus: true })
    expect(draft?.slug).toBe('unpublished-draft')
  })
})

describe('fetchCategories', () => {
  it('returns distinct categories of published posts only', async () => {
    expect(await repo.fetchCategories()).toEqual(['articles'])
  })
})
