import type { Post, PostSummary } from '@/schemas'
import { desc, eq } from 'drizzle-orm'
import { getDB } from '@/db/connector'
import { posts } from '@/db/schema'

export interface FetchPostsConfig {
  ignorePublishStatus?: boolean
}

/**
 * Retrieve posts from the database.
 * By default, only published posts are returned.
 */
export async function fetchPosts(
  config: FetchPostsConfig = {},
): Promise<PostSummary[]> {
  const db = await getDB()

  try {
    const whereClause
      = config?.ignorePublishStatus === true
        ? undefined
        : eq(posts.isPublished, true)

    const query = db
      .select({
        id: posts.id,
        slug: posts.slug,
        category: posts.category,
        title: posts.title,
        description: posts.description,
        author: posts.author,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(whereClause)
      .orderBy(desc(posts.createdAt))

    return await query
  }
  catch (err) {
    console.error('Database query failed:', err)
    throw new Error('Failed to query posts')
  }
}

export interface FetchPostBySlugConfig {
  ignorePublishStatus?: boolean
}

/**
 * Retrieve a single post by slug, including full content.
 * By default, only returns the post if it is published.
 * Returns `null` if not found or not published.
 */
export async function fetchPostBySlug(
  slug: string,
  config: FetchPostBySlugConfig = {},
): Promise<Post | null> {
  const db = await getDB()

  const result = await db
    .select()
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1)

  const post = result[0]

  if (!post) {
    return null
  }

  if (!config.ignorePublishStatus && !post.isPublished) {
    return null
  }

  return post
}
