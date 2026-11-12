import { z } from 'zod'

// ---------------------------------------------------------------------------
// Environment Schema
// ---------------------------------------------------------------------------
// Validates the Worker's bindings (wrangler `vars` + secrets + .dev.vars).
// Workers has no process-wide environment: bindings arrive per request on
// `c.env`, so validation happens per request and is memoized on the
// bindings object (stable for the lifetime of an isolate).
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // Runtime environment: controls the dev-only route; /health reports it
  // as `env`.
  // Defaults to PRODUCTION: this value gates the drafts-exposing __dev route,
  // so a missing binding must fail closed (.dev.vars sets it explicitly).
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('production'),

  // Neon connection string (a Worker secret) in production; locally, in
  // .dev.vars, the content engine's local database on 127.0.0.1 or a Neon
  // branch (see sqlEndpoint in src/db/connector.ts)
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      url => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string',
    ),

  // Bearer token for the draft-preview endpoint (/api/__preview/*).
  // When unset, the endpoint answers with the standard 404 shape. An
  // invalid value (empty, too short) only disables preview: a secret
  // changed with `wrangler secret put` takes effect without a deploy, and
  // an optional feature must not take the public API down with it.
  PREVIEW_SECRET: z
    .string()
    .min(16)
    .optional()
    .catch(() => {
      console.error('PREVIEW_SECRET is shorter than 16 characters: draft preview disabled')
      return undefined
    }),

  // The git SHA this version was deployed from, reported by /health so the
  // deploy can tell its own version from the previous one. scripts/deploy.ts
  // sets it per deploy (`wrangler deploy --var COMMIT_SHA:<sha>`); absent
  // locally. Deliberately unvalidated: a malformed value must not 500 the API.
  COMMIT_SHA: z.string().optional(),

  // Comma-separated list of allowed CORS origins.
  // If empty or omitted, CORS middleware is not applied.
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform(val => val?.split(',').map(origin => origin.trim()).filter(Boolean) ?? []),
})

export type Env = z.infer<typeof envSchema>

/** Raw bindings the Worker receives (wrangler.jsonc vars, secrets, .dev.vars): unvalidated strings. */
export type WorkerBindings = Partial<Record<keyof Env, string>>

const parsedCache = new WeakMap<object, Env>()

/**
 * Validate bindings into a typed Env. Throws on invalid configuration,
 * surfaced as a 500 by the app-level error handler.
 */
export function parseEnv(bindings: WorkerBindings): Env {
  const cached = parsedCache.get(bindings)
  if (cached)
    return cached

  const parsed = envSchema.safeParse(bindings)
  if (!parsed.success) {
    console.error('Environment validation failed:', z.treeifyError(parsed.error))
    throw new Error('Invalid environment configuration')
  }

  parsedCache.set(bindings, parsed.data)
  return parsed.data
}
