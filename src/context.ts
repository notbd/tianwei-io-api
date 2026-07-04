import type { Env, WorkerBindings } from '@/env'
import type { PostsRepo } from '@/lib/repo'

/**
 * Hono type parameter for this app: raw Worker bindings plus the
 * per-request variables resolved by the context middleware in app.ts.
 */
export interface AppEnv {
  Bindings: WorkerBindings
  Variables: {
    env: Env
    repo: PostsRepo
  }
}
