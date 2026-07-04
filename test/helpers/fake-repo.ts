import type { FetchPostsConfig, PostsRepo } from '@/lib/repo'
import type { Post } from '@/schemas'

export const FIXTURE_POSTS: Post[] = [
  {
    id: 2,
    slug: 'newer-post',
    category: 'articles',
    title: 'Newer Post',
    description: 'The newer one',
    author: 'Tianwei Zhang',
    createdAt: new Date('2025-10-23T00:00:00.000Z'),
    updatedAt: new Date('2025-11-05T00:00:00.000Z'),
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
    createdAt: new Date('2024-04-15T00:00:00.000Z'),
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
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
 * In-memory PostsRepo mirroring the real repo's visibility semantics.
 * Records the configs it was called with so tests can assert wiring.
 */
export function createFakeRepo(posts: Post[] = FIXTURE_POSTS) {
  const calls: { fetchPosts: FetchPostsConfig[] } = { fetchPosts: [] }

  const repo: PostsRepo = {
    async fetchPosts(config = {}) {
      calls.fetchPosts.push(config)
      const visible = config.ignorePublishStatus === true
        ? posts
        : posts.filter(post => post.isPublished)
      return visible
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(toSummary)
    },

    async fetchPostBySlug(slug, config = {}) {
      const post = posts.find(candidate => candidate.slug === slug)
      if (!post)
        return null
      if (!config.ignorePublishStatus && !post.isPublished)
        return null
      return post
    },

    async fetchCategories() {
      return [...new Set(posts.filter(post => post.isPublished).map(post => post.category))]
    },
  }

  return { repo, calls }
}

/** A repo whose every method fails — for 500-path contract tests. */
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
export function bindings(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@example.test/db',
    ALLOWED_ORIGINS: '',
    ...overrides,
  }
}
