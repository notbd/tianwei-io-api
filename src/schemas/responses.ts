import { z } from 'zod'

/**
 * Generic success response wrapper.
 */
export function successResponse<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    status: z.literal('success'),
    data: dataSchema,
  })
}

/**
 * Success response with count (for list endpoints).
 */
export function successListResponse<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    status: z.literal('success'),
    count: z.number(),
    data: z.array(itemSchema),
  })
}

/**
 * Standard error response.
 */
export const errorResponse = z.object({
  status: z.literal('error'),
  message: z.string(),
})

// Inferred types for use in route handlers
export interface SuccessResponse<T> {
  status: 'success'
  data: T
}

export interface SuccessListResponse<T> {
  status: 'success'
  count: number
  data: T[]
}

export type ErrorResponse = z.infer<typeof errorResponse>
