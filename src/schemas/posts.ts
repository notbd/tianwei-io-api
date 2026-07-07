import { z } from 'zod'

/**
 * Full post schema (returned by single post endpoint).
 *
 * TYPE SOURCE ONLY: responses are never runtime-validated against this
 * (the DB is trusted), so keep fields structural — a format constraint
 * here would be dead weight now and a 500-on-legacy-data trap if output
 * validation is ever switched on.
 */
export const postSchema = z.object({
  id: z.number(),
  slug: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  author: z.string(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  isPublished: z.boolean(),
  content: z.string(),
})

/**
 * Post summary schema (returned by list endpoint - no content).
 */
export const postSummarySchema = postSchema.omit({
  content: true,
  isPublished: true,
})

export type Post = z.infer<typeof postSchema>
export type PostSummary = z.infer<typeof postSummarySchema>
