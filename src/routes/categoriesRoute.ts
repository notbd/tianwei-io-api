import { Hono } from 'hono'
import { fetchCategories } from '@/lib/categories'
import { apiRes } from '@/lib/responses'

/**
 * /api/categories - Retrieves list of unique post categories.
 */
const categoriesRoute = new Hono()

categoriesRoute.get('/categories', async (c) => {
  try {
    const categories = await fetchCategories()

    return apiRes.list(c, categories)
  }
  catch (err) {
    console.error('Error fetching categories:', err)
    return apiRes.err(c, 'Failed to fetch categories.', 500)
  }
})

export default categoriesRoute
