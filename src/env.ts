import process from 'node:process'
import dotenv from 'dotenv'
import { z } from 'zod'

const EnvSchema = z.object({
  DEPLOYMENT_ENV: z.enum(['dev', 'prod']),
  DATABASE_URL: z.url().min(1, 'DATABASE_URL is required'),
})

export type Env = z.infer<typeof EnvSchema>

dotenv.config({ path: '.env.local', quiet: true })

export async function getEnv(): Promise<Env> {
  const parsed = EnvSchema.safeParse({
    DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
  })

  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error)
    console.error('Invalid environment variables:')
    console.dir(tree, { depth: null })
    throw new Error('Invalid environment configuration')
  }

  return parsed.data
}
