import { z } from 'zod'

const EnvSchema = z.object({
  DEPLOYMENT_ENV: z.enum(['dev', 'prod']),
  DATABASE_URL: z.url().min(1, 'DATABASE_URL is required'),
})

export type Env = z.infer<typeof EnvSchema>

export async function getEnv(): Promise<Env> {
  const isNode = typeof (globalThis as any).process?.versions?.node === 'string'

  // only load `.env.local` if under Node.js runtime
  if (isNode) {
    const dotenv = await import('dotenv')
    dotenv.config({ path: '.env.local', quiet: true })
  }

  const source = isNode ? process.env : (globalThis as Record<string, unknown>)

  const parsed = EnvSchema.safeParse({
    DEPLOYMENT_ENV: source.DEPLOYMENT_ENV,
    DATABASE_URL: source.DATABASE_URL,
  })

  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error)
    console.error('Invalid environment variables:')
    console.dir(tree, { depth: null })
    throw new Error('Invalid environment configuration')
  }

  return parsed.data
}
