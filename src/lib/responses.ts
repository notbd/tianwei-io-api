import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { HTTPException } from 'hono/http-exception'

// The wire envelopes. Every message string passed to these helpers is part
// of the contract the frontend parses (test/contract pins them).

export type SuccessResponse<T> = {
  status: 'success'
  data: T
}

export type SuccessListResponse<T> = {
  status: 'success'
  count: number
  data: T[]
}

export type ErrorResponse = {
  status: 'error'
  message: string
}

/**
 * API response helpers.
 * Usage: apiRes.ok(c, data), apiRes.list(c, items), apiRes.err(c, message, status)
 */
export const apiRes = {
  ok<T>(c: Context, data: T) {
    return c.json({ status: 'success', data } satisfies SuccessResponse<T>)
  },

  list<T>(c: Context, data: T[]) {
    return c.json({ status: 'success', count: data.length, data } satisfies SuccessListResponse<T>)
  },

  err(c: Context, message: string, status: ContentfulStatusCode = 500) {
    return c.json({ status: 'error', message } satisfies ErrorResponse, status)
  },
}

/**
 * For `.catch()` on a repo read: turns a driver error into a 500 carrying
 * the endpoint's public message. The app's onError logs the cause and
 * answers with the error envelope.
 */
export function failWith(message: string) {
  return (cause: unknown): never => {
    throw new HTTPException(500, { message, cause })
  }
}
