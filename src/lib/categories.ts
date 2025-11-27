import { eq } from 'drizzle-orm'
import { getDB } from '@/db/connector'
import { posts } from '@/db/schema'

/**
 * Retrieve unique categories from published posts.
 */
export async function fetchCategories(): Promise<string[]> {
  const db = await getDB()

  const result = await db
    .selectDistinct({ category: posts.category })
    .from(posts)
    .where(eq(posts.isPublished, true))

  return result.map(r => r.category).filter(Boolean)
}
