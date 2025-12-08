import process from 'node:process'
import dotenv from 'dotenv'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Environment Schema
// ---------------------------------------------------------------------------
// Defines and validates all required environment variables for the API service.
// See .env.example for documentation on each variable.
// ---------------------------------------------------------------------------

const EnvSchema = z.object({
  // Runtime environment: controls behavior like dev-only routes and logging
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Primary database connection (local Docker or remote prod)
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      url => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string',
    ),

  // Remote database connection for local testing against production data
  // Optional - only used by test scripts
  DATABASE_URL_REMOTE: z
    .string()
    .refine(
      url => !url || url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL_REMOTE must be a valid PostgreSQL connection string',
    )
    .optional(),

  // Port for the Hono server to listen on
  PORT: z.coerce.number().int().positive().default(3001),

  // Comma-separated list of allowed CORS origins
  // If empty or omitted, CORS middleware is not applied
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

// ---------------------------------------------------------------------------
// Environment Loading
// ---------------------------------------------------------------------------
// In development: loads from .env.local file
// In production: expects variables to be set by the deployment platform
// ---------------------------------------------------------------------------

let cachedEnv: Env | null = null

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv
  }

  // Only load .env.local in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: '.env.local' })
  }

  const parsed = EnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_REMOTE: process.env.DATABASE_URL_REMOTE,
    PORT: process.env.PORT,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  })

  if (!parsed.success) {
    console.error('Environment validation failed:')
    console.error(z.treeifyError(parsed.error))
    throw new Error('Invalid environment configuration')
  }

  cachedEnv = parsed.data
  return cachedEnv
}

// Clear cached env (useful for testing)
export function clearEnvCache(): void {
  cachedEnv = null
}

// Helper to check if running in production
export function isProd(): boolean {
  return getEnv().NODE_ENV === 'production'
}

// Helper to check if running in development
export function isDev(): boolean {
  return getEnv().NODE_ENV === 'development'
}
