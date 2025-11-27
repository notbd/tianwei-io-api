import { Hono } from 'hono'
import { fetchCategories } from '@/lib/categories'

/**
 * /api/categories - Retrieves list of unique post categories.
 */
const categoriesRoute = new Hono()

categoriesRoute.get('/categories', async (c) => {
  try {
    const categories = await fetchCategories()

    return c.json(
      {
        status: 'success',
        count: categories.length,
        data: categories,
      },
    )
  }
  catch (err) {
    console.error('Error fetching categories:', err)
    return c.json(
      {
        status: 'error',
        message: 'Failed to fetch categories.',
      },
      500,
    )
  }
})

export default categoriesRoute
