import type { PostsRepo } from '@/lib/repo'
import { PGlite } from '@electric-sql/pglite'
import { pushSchema } from 'drizzle-kit/api'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createDrizzleRepo } from '@/lib/repo'

// Exercises the real SQL the repo issues, against an in-memory Postgres.

let client: PGlite
let repo: PostsRepo

// One database for the whole file: every test below is read-only.
beforeAll(async () => {
  client = new PGlite()
  const db = drizzle(client, { schema })

  // drizzle-kit declares pushSchema's db as schema-less, which a db typed
  // with our schema does not satisfy; it only runs SQL through it.
  const { apply } = await pushSchema(schema, db as never)
  await apply()

  // Dates are ET midnight, as the content engine stores them.
  await db.insert(schema.posts).values([
    // Inserted first (lowest id) on purpose: it shares its day with
    // published-new, and 'misc' sorts after 'articles' but comes back first
    // from PGlite's HashAggregate, so the categories test needs the ORDER BY.
    {
      slug: 'published-same-day',
      category: 'misc',
      title: 'Same day',
      description: null,
      author: 'Tianwei Zhang',
      createdAt: new Date('2025-10-23T04:00:00.000Z'),
      isPublished: true,
      content: 'same-day content',
    },
    {
      slug: 'published-old',
      category: 'articles',
      title: 'Old',
      description: null,
      author: 'Tianwei Zhang',
      createdAt: new Date('2024-04-15T04:00:00.000Z'),
      isPublished: true,
      content: 'old content',
    },
    {
      slug: 'published-new',
      category: 'articles',
      title: 'New',
      description: 'newest',
      author: 'Tianwei Zhang',
      createdAt: new Date('2025-10-23T04:00:00.000Z'),
      updatedAt: new Date('2025-11-05T05:00:00.000Z'),
      isPublished: true,
      content: 'new content',
    },
    {
      slug: 'unpublished-draft',
      category: 'notes',
      title: 'Draft',
      description: null,
      author: 'Tianwei Zhang',
      createdAt: new Date('2026-01-01T05:00:00.000Z'),
      isPublished: false,
      content: 'draft content',
    },
  ])

  repo = createDrizzleRepo(db)
})

afterAll(async () => {
  await client.close()
})

describe('fetchPosts', () => {
  it('returns only published posts, newest first with id breaking same-day ties, without content/isPublished', async () => {
    const rows = await repo.fetchPosts()
    expect(rows.map(row => row.slug)).toEqual(['published-new', 'published-same-day', 'published-old'])
    expect(rows[0]).toEqual({
      id: 3, // ids follow insertion order
      slug: 'published-new',
      category: 'articles',
      title: 'New',
      description: 'newest',
      author: 'Tianwei Zhang',
      createdAt: new Date('2025-10-23T04:00:00.000Z'),
      updatedAt: new Date('2025-11-05T05:00:00.000Z'),
    })
    // updatedAt is nullable: absent means "never updated"
    expect(rows[2]?.updatedAt).toBeNull()
  })

  it('includes drafts when includeDrafts is set', async () => {
    const rows = await repo.fetchPosts({ includeDrafts: true })
    expect(rows.map(row => row.slug)).toEqual([
      'unpublished-draft',
      'published-new',
      'published-same-day',
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
      createdAt: new Date('2024-04-15T04:00:00.000Z'),
    })
  })

  it('returns null for a missing slug', async () => {
    expect(await repo.fetchPostBySlug('nope')).toBeNull()
  })

  it('hides unpublished posts by default, reveals them when asked', async () => {
    expect(await repo.fetchPostBySlug('unpublished-draft')).toBeNull()
    const draft = await repo.fetchPostBySlug('unpublished-draft', { includeDrafts: true })
    expect(draft?.slug).toBe('unpublished-draft')
  })
})

describe('fetchCategories', () => {
  it('returns distinct categories of published posts only, alphabetical', async () => {
    expect(await repo.fetchCategories()).toEqual(['articles', 'misc'])
  })
})
