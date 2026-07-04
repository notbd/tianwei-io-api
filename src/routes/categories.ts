import type { AppEnv } from '@/context'
import { Hono } from 'hono'
import { apiRes } from '@/lib/responses'

/**
 * GET /api/categories - Retrieves list of unique post categories.
 */
const categoriesRoute = new Hono<AppEnv>()

categoriesRoute.get('/categories', async (c) => {
  try {
    const categories = await c.get('repo').fetchCategories()

    return apiRes.list(c, categories)
  }
  catch (err) {
    console.error('Error fetching categories:', err)
    return apiRes.err(c, 'Failed to fetch categories.', 500)
  }
})

export default categoriesRoute
