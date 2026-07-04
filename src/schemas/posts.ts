import { z } from 'zod'
import { slugParam } from './params'

/**
 * Full post schema (returned by single post endpoint).
 */
export const postSchema = z.object({
  id: z.number(),
  slug: slugParam.shape.slug,
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
