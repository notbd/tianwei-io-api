import type { Database } from '@/db/connector'
import type { Post, PostSummary } from '@/schemas'
import { desc, eq } from 'drizzle-orm'
import { posts } from '@/db/schema'

export interface FetchPostsConfig {
  ignorePublishStatus?: boolean
}

export interface FetchPostBySlugConfig {
  ignorePublishStatus?: boolean
}

/**
 * Data-access boundary for the API. Handlers depend on this interface,
 * never on a concrete driver — production wires it to Drizzle over
 * neon-http, tests inject fakes or a PGlite-backed instance.
 */
export interface PostsRepo {
  /** List posts (summary shape), newest first. Published only by default. */
  fetchPosts: (config?: FetchPostsConfig) => Promise<PostSummary[]>
  /** Fetch one post with full content; null if absent or unpublished. */
  fetchPostBySlug: (slug: string, config?: FetchPostBySlugConfig) => Promise<Post | null>
  /** Distinct categories across published posts. */
  fetchCategories: () => Promise<string[]>
}

export function createDrizzleRepo(db: Database): PostsRepo {
  return {
    // Driver errors propagate untouched: every route handler already
    // catches, logs, and shapes them, and a wrapped generic error would
    // only hide the real cause and double the logging.
    async fetchPosts(config = {}) {
      const whereClause
        = config.ignorePublishStatus === true
          ? undefined
          : eq(posts.isPublished, true)

      return db
        .select({
          id: posts.id,
          slug: posts.slug,
          category: posts.category,
          title: posts.title,
          description: posts.description,
          author: posts.author,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .where(whereClause)
        .orderBy(desc(posts.createdAt))
    },

    async fetchPostBySlug(slug, config = {}) {
      const result = await db
        .select()
        .from(posts)
        .where(eq(posts.slug, slug))
        .limit(1)

      const post = result[0]

      if (!post)
        return null

      if (!config.ignorePublishStatus && !post.isPublished)
        return null

      return post
    },

    async fetchCategories() {
      const result = await db
        .selectDistinct({ category: posts.category })
        .from(posts)
        .where(eq(posts.isPublished, true))

      return result.map(row => row.category)
    },
  }
}
