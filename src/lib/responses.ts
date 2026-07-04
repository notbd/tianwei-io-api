import type { Context } from 'hono'
import type {
  ErrorResponse,
  SuccessListResponse,
  SuccessResponse,
} from '@/schemas'

/**
 * API response helpers.
 * Usage: apiRes.ok(c, data), apiRes.list(c, items), apiRes.err(c, message, status)
 */
export const apiRes = {
  /**
   * Return a success response with a single data item.
   */
  ok<T>(c: Context, data: T) {
    return c.json({
      status: 'success',
      data,
    } satisfies SuccessResponse<T>)
  },

  /**
   * Return a success response with a list of items.
   */
  list<T>(c: Context, data: T[]) {
    return c.json({
      status: 'success',
      count: data.length,
      data,
    } satisfies SuccessListResponse<T>)
  },

  /**
   * Return an error response with a message.
   */
  err(c: Context, message: string, status: 400 | 401 | 404 | 429 | 500 = 500) {
    return c.json(
      {
        status: 'error',
        message,
      } satisfies ErrorResponse,
      status,
    )
  },
}
