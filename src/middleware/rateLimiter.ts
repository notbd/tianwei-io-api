import type { MiddlewareHandler } from 'hono'
import { apiRes } from '@/lib/responses'

const store = new Map<
  string,
  {
    count: number
    resetTime: number
  }
>()

export function rateLimiter(
  windowMs: number,
  max: number,
): MiddlewareHandler {
  return async (c, next) => {
    const ip
      = c.req.header('x-forwarded-for')?.split(',')[0].trim()
        || c.req.header('x-real-ip')
        || 'unknown'

    const now = Date.now()
    const record = store.get(ip)

    if (!record || record.resetTime <= now) {
      store.set(
        ip,
        {
          count: 1,
          resetTime: now + windowMs,
        },
      )
    }
    else {
      record.count++
      if (record.count > max) {
        return apiRes.err(c, 'Rate limit exceeded', 429)
      }
    }

    return next()
  }
}
