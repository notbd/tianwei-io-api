import { validator } from 'hono/validator'
import { z } from 'zod'
import { SLUG_MAX_LENGTH } from '@/db/schema'
import { apiRes } from '@/lib/responses'

/**
 * Slug path parameter: lowercase alphanumeric, hyphens allowed but not
 * consecutive. The messages are part of the 400 the frontend maps to 404.
 */
const slugParamSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug cannot be empty')
    .max(SLUG_MAX_LENGTH, 'Slug is too long')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with non-consecutive hyphens',
    ),
})

/** Validates `:slug`; a bad one gets a 400 naming the first failed rule. */
export const validSlug = validator('param', (params, c) => {
  const result = slugParamSchema.safeParse(params)
  if (result.success)
    return result.data

  // zod reports at least one issue for a failed parse
  const issue = result.error.issues[0]!
  return apiRes.err(c, `Validation failed: ${issue.path.join('.')} - ${issue.message}`, 400)
})
