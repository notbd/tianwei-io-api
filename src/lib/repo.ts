import type { Database } from '@/db/connector'
import { asc, desc, eq } from 'drizzle-orm'
import { posts } from '@/db/schema'

/** A full row: the shape /api/post/:slug serves (Dates serialize as ISO strings). */
export type Post = typeof posts.$inferSelect

/** The list shape served by /api/posts: everything but the body and the flag. */
export type PostSummary = Omit<Post, 'content' | 'isPublished'>

export interface FetchPostsConfig {
  ignorePublishStatus?: boolean
}

/**
 * Data-access boundary for the API. Handlers depend on this interface,
 * never on a concrete driver: production wires it to Drizzle over
 * neon-http, tests inject fakes or a PGlite-backed instance.
 */
export interface PostsRepo {
  /** List posts (summary shape), newest first (createdAt, then id). Published only by default. */
  fetchPosts: (config?: FetchPostsConfig) => Promise<PostSummary[]>
  /** Fetch one post with full content; null if absent or unpublished. */
  fetchPostBySlug: (slug: string, config?: FetchPostsConfig) => Promise<Post | null>
  /** Distinct categories across published posts, alphabetical. */
  fetchCategories: () => Promise<string[]>
}

export function createDrizzleRepo(db: Database): PostsRepo {
  return {
    // Driver errors propagate untouched: each route names the failure
    // (failWith) and app.onError logs the cause once.
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
        // Dates carry day precision, so same-day posts tie-break on id
        // (the later import first) to keep the order stable across rebuilds.
        .orderBy(desc(posts.createdAt), desc(posts.id))
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
        .orderBy(asc(posts.category))

      return result.map(row => row.category)
    },
  }
}
