import { desc, eq } from 'drizzle-orm'
import { getDB } from '@/db/connector'
import { posts } from '@/db/schema'

export interface fetchPostsConfig {
  ignorePublishStatus?: boolean
}

/**
 * Retrieve posts from the database. By default, only published posts are returned.
 */
export async function fetchPosts(config: fetchPostsConfig = {}) {
  const db = await getDB()

  try {
    const whereClause = config?.ignorePublishStatus === true
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
