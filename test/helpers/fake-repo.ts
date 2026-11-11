import type { WorkerBindings } from '@/env'
import type { Post, PostsRepo, ReadOptions } from '@/lib/repo'

// Dates are ET midnight, as the content engine stores them
// (T05:00Z while EST is in effect, T04:00Z under EDT).
export const FIXTURE_POSTS: Post[] = [
  {
    id: 2,
    slug: 'newer-post',
    category: 'articles',
    title: 'Newer Post',
    description: 'The newer one',
    author: 'Tianwei Zhang',
    createdAt: new Date('2025-10-23T04:00:00.000Z'),
    updatedAt: new Date('2025-11-05T05:00:00.000Z'),
    isPublished: true,
    content: '# Newer\n\nBody.\n',
  },
  {
    id: 1,
    slug: 'older-post',
    category: 'articles',
    title: 'Older Post',
    description: null,
    author: 'Tianwei Zhang',
    createdAt: new Date('2024-04-15T04:00:00.000Z'),
    updatedAt: null,
    isPublished: true,
    content: '# Older\n\nBody.\n',
  },
  {
    id: 3,
    slug: 'draft-post',
    category: 'notes',
    title: 'Draft Post',
    description: 'Unpublished',
    author: 'Tianwei Zhang',
    createdAt: new Date('2026-01-01T05:00:00.000Z'),
    updatedAt: null,
    isPublished: false,
    content: 'Draft body.\n',
  },
]

function toSummary(post: Post) {
  const { content: _content, isPublished: _isPublished, ...summary } = post
  return summary
}

/**
 * In-memory PostsRepo mirroring the real repo's visibility rule.
 * Records the options fetchPosts was called with so tests can assert wiring.
 */
export function createFakeRepo(posts: Post[] = FIXTURE_POSTS) {
  const calls: { fetchPosts: ReadOptions[] } = { fetchPosts: [] }
  const visible = ({ includeDrafts = false }: ReadOptions = {}) =>
    (post: Post) => includeDrafts || post.isPublished

  const repo: PostsRepo = {
    async fetchPosts(options = {}) {
      calls.fetchPosts.push(options)
      return posts
        .filter(visible(options))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
        .map(toSummary)
    },

    async fetchPostBySlug(slug, options) {
      return posts.find(post => post.slug === slug && visible(options)(post)) ?? null
    },

    async fetchCategories() {
      return [
        ...new Set(posts.filter(visible()).map(post => post.category)),
      ].sort()
    },
  }

  return { repo, calls }
}

/** A repo whose every method fails, for 500-path contract tests. */
export function createThrowingRepo(): PostsRepo {
  const boom = async () => {
    throw new Error('Failed to query posts')
  }
  return {
    fetchPosts: boom,
    fetchPostBySlug: boom,
    fetchCategories: boom,
  }
}

/** Standard bindings for app.request(); override per test as needed. */
export function bindings(overrides: Partial<WorkerBindings> = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@example.test/db',
    ALLOWED_ORIGINS: '',
    ...overrides,
  }
}
