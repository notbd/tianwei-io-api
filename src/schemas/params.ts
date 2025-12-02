import { z } from 'zod'

/**
 * Validates slug parameter from URL path.
 * Rules: lowercase alphanumeric, hyphens allowed but not consecutive.
 */
export const slugParam = z.object({
  slug: z
    .string()
    .min(1, 'Slug cannot be empty')
    .max(200, 'Slug is too long')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with non-consecutive hyphens',
    ),
})

export type SlugParam = z.infer<typeof slugParam>
