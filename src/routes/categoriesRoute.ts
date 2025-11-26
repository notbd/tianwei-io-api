import type { InferSelectModel } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDB } from '@/db/connector'
import { posts } from '@/db/schema'

type PostRow = InferSelectModel<typeof posts>
type CategoryRow = Pick<PostRow, 'category'>

/**
 * /api/categories - Retrieves list of unique post categories.
 */
const categoriesRoute = new Hono()

categoriesRoute.get('/categories', async (c) => {
  try {
    const db = await getDB()

    // Since categories are stored as enum or varchar, we can query distincts
    const result = (
      await db
        .selectDistinct({
          category: posts.category,
        })
        .from(posts))

    const categories = result.map((r: CategoryRow) => r.category).filter(Boolean)
    return c.json({
      status: 'success',
      count: categories.length,
      data: categories,
    })
  }
  catch (err) {
    console.error('Error fetching categories:', err)
    return c.json({
      status: 'error',
      message: 'Failed to fetch categories.',
    }, 500)
  }
})

export default categoriesRoute
