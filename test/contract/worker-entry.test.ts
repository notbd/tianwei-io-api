import { describe, expect, it } from 'vitest'
import worker from '@/index'
import { bindings } from '../helpers/fake-repo'

// The other suites build the app with an injected repo; this one goes through
// the object the Worker actually exports, including the real data-layer
// wiring (/health never queries, so no database is needed).

describe('worker entry', () => {
  it('serves /health through the default export without an injected repo', async () => {
    const res = await worker.request('/health', {}, bindings())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', env: 'production' })
    expect(typeof worker.fetch).toBe('function')
  })
})
