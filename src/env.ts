import { z } from 'zod'

// ---------------------------------------------------------------------------
// Environment Schema
// ---------------------------------------------------------------------------
// Validates the Worker's bindings (wrangler `vars` + secrets + .dev.vars).
// Unlike the Node.js version, there is no process-wide environment: bindings
// arrive per request on `c.env`, so validation happens per request and is
// memoized on the bindings object (stable for the lifetime of an isolate).
// ---------------------------------------------------------------------------

const EnvSchema = z.object({
  // Runtime environment: controls dev-only routes and request logging.
  // Kept as NODE_ENV so /health's `env` field is unchanged from the fly.io era.
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Neon connection string (Worker secret in production, .dev.vars locally)
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      url => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string',
    ),

  // Bearer token for the draft-preview endpoint (/api/__preview/*).
  // When unset, the endpoint answers with the standard 404 shape.
  PREVIEW_SECRET: z
    .string()
    .min(16, 'PREVIEW_SECRET must be at least 16 characters')
    .optional(),

  // Comma-separated list of allowed CORS origins.
  // If empty or omitted, CORS middleware is not applied.
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '')
        return []
      return val.split(',').map(origin => origin.trim()).filter(Boolean)
    }),
})

export type Env = z.infer<typeof EnvSchema>

/** Raw bindings shape the Worker receives (see wrangler.jsonc / .dev.vars). */
export interface WorkerBindings {
  NODE_ENV?: string
  DATABASE_URL?: string
  PREVIEW_SECRET?: string
  ALLOWED_ORIGINS?: string
}

const parsedCache = new WeakMap<object, Env>()

/**
 * Validate bindings into a typed Env. Throws on invalid configuration —
 * surfaced as a 500 by the app-level error handler.
 */
export function parseEnv(bindings: WorkerBindings): Env {
  const cached = parsedCache.get(bindings)
  if (cached)
    return cached

  const parsed = EnvSchema.safeParse(bindings)
  if (!parsed.success) {
    console.error('Environment validation failed:', z.treeifyError(parsed.error))
    throw new Error('Invalid environment configuration')
  }

  parsedCache.set(bindings, parsed.data)
  return parsed.data
}
