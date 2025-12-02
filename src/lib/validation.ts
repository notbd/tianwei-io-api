import type { Context } from 'hono'

interface ValidationResult {
  success: boolean
  error?: {
    issues: Array<{
      path: PropertyKey[]
      message: string
    }>
  }
}

/**
 * Custom error hook for @hono/zod-validator.
 * On success, returns undefined to continue to the handler.
 * On failure, returns a consistent 400 error response.
 */
export function validationErrorHook(
  result: ValidationResult,
  c: Context,
) {
  if (result.success) {
    return
  }

  const firstIssue = result.error?.issues[0]
  const path = firstIssue?.path.join('.') || 'unknown'
  const message = firstIssue?.message || 'Invalid input'

  return c.json(
    {
      status: 'error',
      message: `Validation failed: ${path} - ${message}`,
    },
    400,
  )
}
