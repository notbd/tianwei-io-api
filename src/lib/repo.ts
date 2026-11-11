import type { Database } from '@/db/connector'
import { and, asc, desc, eq } from 'drizzle-orm'
import { posts } from '@/db/schema'

/** A full row: the shape /api/post/:slug serves (Dates serialize as ISO strings). */
export type Post = typeof posts.$inferSelect

/** The list shape served by /api/posts: everything but the body and the flag. */
export type PostSummary = Omit<Post, 'content' | 'isPublished'>

/** Which posts a read may return: published ones, plus drafts when asked. */
export type ReadOptions = {
  includeDrafts?: boolean
}

/**
 * Data-access boundary for the API. Handlers depend on this interface,
 * never on a concrete driver: production wires it to Drizzle over
 * neon-http, tests inject fakes or a PGlite-backed instance.
 */
export type PostsRepo = {
  /** List posts (summary shape), newest first (createdAt, then id). */
  fetchPosts: (options?: ReadOptions) => Promise<PostSummary[]>
  /** Fetch one post with full content; null if absent or not visible. */
  fetchPostBySlug: (slug: string, options?: ReadOptions) => Promise<Post | null>
  /** Distinct categories across published posts, alphabetical. */
  fetchCategories: () => Promise<string[]>
}

/** The one visibility rule, as a WHERE condition (undefined: no filter). */
function visible({ includeDrafts = false }: ReadOptions = {}) {
  return includeDrafts
    ? undefined
    : eq(posts.isPublished, true)
}

export function createDrizzleRepo(db: Database): PostsRepo {
  return {
    // Driver errors propagate untouched: each route names the failure
    // (failWith) and app.onError logs the cause once.
    async fetchPosts(options) {
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
        .where(visible(options))
        // Dates carry day precision, so same-day posts tie-break on id
        // (the later import first) to keep the order stable across rebuilds.
        .orderBy(desc(posts.createdAt), desc(posts.id))
    },

    async fetchPostBySlug(slug, options) {
      const [post] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.slug, slug), visible(options)))
        .limit(1)
      return post ?? null
    },

    async fetchCategories() {
      const rows = await db
        .selectDistinct({ category: posts.category })
        .from(posts)
        .where(visible())
        .orderBy(asc(posts.category))
      return rows.map(row => row.category)
    },
  }
}
