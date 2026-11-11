import type { Deps, Fetch, Wrangler } from '../../scripts/deploy.ts'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { check, release, restore, verify } from '../../scripts/deploy.ts'

// Every path of the production deploy, with wrangler and the network faked:
// the script's first run against real Cloudflare is a production deploy.

const SHA = '3e5c57a0d1c4f6b8a9e2d7c5b3a1f0e9d8c7b6a5'
const OLD_SHA = '703660c1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7'
const BEFORE = 'version-before'
const AFTER = 'version-after'
const MESSAGE = 'Restore after a failed deploy'

const timing = { budgetMs: 1_000, intervalMs: 5, timeoutMs: 100 }

/**
 * The clock the budget is measured on. It stands still unless a test moves
 * it, so a slow machine cannot use up a budget; the waits between attempts
 * and the per-request timeout still take real time.
 */
const clock = { now: 0 }

/** `fetch`, with every request taking `ms` on the clock. */
function taking(ms: number, fetch: Fetch): Fetch {
  return async (url, init) => {
    clock.now += ms
    return fetch(url, init)
  }
}

type Result = Awaited<ReturnType<Wrangler>>
const ok = (stdout = ''): Result => ({ code: 0, stdout })
const failed: Result = { code: 1, stdout: '' }

/**
 * What `wrangler deployments status --json` prints (wrangler 4.156,
 * cli.js:362049-362052): the API's latest deployment object, whole.
 */
function statusJson(...versions: [id: string, percentage: number][]) {
  return JSON.stringify({
    id: 'a3c1e2b0-0000-4000-8000-000000000000',
    source: 'wrangler',
    strategy: 'percentage',
    author_email: 'owner@example.test',
    annotations: { 'workers/triggered_by': 'upload' },
    created_on: '2026-11-10T12:00:00.000000Z',
    versions: versions.map(([version_id, percentage]) => ({ version_id, percentage })),
  }, null, 2)
}

/**
 * A fake wrangler over one Worker: `deployments status` reports the live
 * version, deploy makes AFTER live, rollback makes its target live. A test
 * overrides a command to make it fail or misbehave.
 */
function fakeWrangler(on: {
  status?: (live: string) => Result
  deploy?: (worker: { live: string }) => Result
  rollback?: (worker: { live: string }, target: string) => Result
} = {}) {
  const worker = { live: BEFORE }
  const calls: string[][] = []
  const {
    status = live => ok(statusJson([live, 100])),
    deploy = (w) => {
      w.live = AFTER
      return ok()
    },
    rollback = (w, target) => {
      w.live = target
      return ok()
    },
  } = on
  const wrangler: Wrangler = async (args) => {
    calls.push(args)
    const [command = ''] = args
    switch (command) {
      case 'deployments': return status(worker.live)
      case 'deploy': return deploy(worker)
      case 'rollback': return rollback(worker, args[1] ?? '')
      default: throw new Error(`unexpected call: wrangler ${args.join(' ')}`)
    }
  }
  return { wrangler, worker, calls }
}

/**
 * A fake API answering by path; each handler gets its path's 1-based attempt
 * number. 'hang' never answers, so only the request's own timeout ends it.
 */
function fakeApi(routes: Record<string, (attempt: number) => Response | 'hang'> = {}) {
  const attempts: Record<string, number> = {}
  const all: Record<string, (attempt: number) => Response | 'hang'> = {
    '/health': () => Response.json({ status: 'ok', env: 'production', commit: SHA }),
    '/api/posts': () => Response.json({
      status: 'success',
      count: 1,
      data: [
        {
          id: 1,
          slug: 'first post',
          title: 'First',
          createdAt: '2025-10-23T04:00:00.000Z',
        },
      ],
    }),
    '/api/categories': () => Response.json({
      status: 'success',
      count: 1,
      data: ['articles'],
    }),
    '/api/post/first%20post': () => Response.json({
      status: 'success',
      data: {
        id: 1,
        slug: 'first post',
        title: 'First',
        content: '# First\n',
      },
    }),
    ...routes,
  }
  const fetch: Fetch = async (url, { signal }) => {
    const attempt = (attempts[url.pathname] ?? 0) + 1
    attempts[url.pathname] = attempt
    const answer = all[url.pathname]?.(attempt)
      ?? Response.json({ status: 'error', message: 'Not Found' }, { status: 404 })
    if (answer === 'hang') {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    }
    return answer
  }
  return { fetch, attempts }
}

const serverError = () => Response.json({ status: 'error', message: 'Failed to fetch posts.' }, { status: 500 })

let dir: string
let stateFile: string

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  clock.now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => clock.now)
  dir = await mkdtemp(join(tmpdir(), 'deploy-test-'))
  stateFile = join(dir, 'worker-version-before')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

function deps(wrangler: Wrangler, fetch: Fetch = fakeApi().fetch): Deps {
  return { wrangler, fetch, stateFile, timing }
}

describe('check', () => {
  it('passes when wrangler prints a version number', async () => {
    await expect(check(async () => ok('4.156.0\n'))).resolves.toBeUndefined()
  })

  it.each([
    [
      'a non-zero exit',
      { code: 1, stdout: '4.156.0\n' },
    ],
    [
      'output that is not a version',
      ok('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "wrangler" not found\n'),
    ],
  ])('fails on %s', async (_, result) => {
    await expect(check(async () => result)).rejects.toThrow('wrangler --version')
  })
})

describe('release', () => {
  it('saves the live version before deploying the commit, then verifies it', async () => {
    const { wrangler, calls } = fakeWrangler()
    let savedAtDeploy: string | undefined
    const watching: Wrangler = async (args, options) => {
      if (args[0] === 'deploy')
        savedAtDeploy = await readFile(stateFile, 'utf8')
      return wrangler(args, options)
    }

    await release(SHA, deps(watching))

    expect(savedAtDeploy).toBe(BEFORE)
    expect(calls).toEqual([
      ['deployments', 'status', '--json'],
      ['deploy', '--var', `COMMIT_SHA:${SHA}`],
    ])
  })

  it.each([
    [
      'the status command fails',
      () => failed,
    ],
    [
      'traffic is split across two versions',
      () => ok(statusJson([BEFORE, 50], ['other', 50])),
    ],
    [
      'the output is not JSON',
      () => ok('▲ [WARNING] something\n'),
    ],
  ])('does not deploy when %s, and restore then does nothing', async (_, status) => {
    const { wrangler, calls } = fakeWrangler({ status })

    await expect(release(SHA, deps(wrangler))).rejects.toThrow()
    expect(calls).toEqual([
      ['deployments', 'status', '--json'],
    ])
    expect(existsSync(stateFile)).toBe(false)

    await restore(deps(wrangler))
    expect(calls).toHaveLength(1)
  })

  it('leaves the live version alone when the deploy fails before going live', async () => {
    const { wrangler, worker, calls } = fakeWrangler({
      deploy: () => failed,
    })

    await expect(release(SHA, deps(wrangler))).rejects.toThrow('wrangler deploy exited with code 1')
    await restore(deps(wrangler))

    expect(worker.live).toBe(BEFORE)
    expect(calls.map(([command]) => command)).toEqual(['deployments', 'deploy', 'deployments'])
  })

  it('rolls back when the deploy fails after the new version went live', async () => {
    const { wrangler, worker, calls } = fakeWrangler({
      deploy: (w) => {
        w.live = AFTER
        return failed
      },
    })

    await expect(release(SHA, deps(wrangler))).rejects.toThrow('wrangler deploy exited with code 1')
    await restore(deps(wrangler))

    expect(worker.live).toBe(BEFORE)
    expect(calls).toContainEqual([
      'rollback',
      BEFORE,
      '--yes',
      '--message',
      MESSAGE,
    ])
  })

  it('rolls back when the verification fails', async () => {
    const { wrangler, worker } = fakeWrangler()
    const api = fakeApi({ '/api/posts': serverError })

    // the requests move the clock: on one that stands still, the budget never runs out
    await expect(release(SHA, deps(wrangler, taking(333, api.fetch)))).rejects.toThrow('GET /api/posts')
    expect(worker.live).toBe(AFTER)
    await restore(deps(wrangler))

    expect(worker.live).toBe(BEFORE)
  })
})

describe('restore', () => {
  it('does nothing without a saved version', async () => {
    const { wrangler, calls } = fakeWrangler()
    await restore(deps(wrangler))
    expect(calls).toEqual([])
  })

  it.each([
    [
      'the rollback command fails',
      {
        rollback: () => failed,
      },
      'wrangler rollback exited with code 1',
    ],
    // a declined confirmation: wrangler cancels and still exits 0 (wrangler 4.156, cli.js:362256-362263)
    [
      'the rollback exits 0 but the version did not change',
      {
        rollback: () => ok(),
      },
      `After the rollback ${AFTER} is live`,
    ],
    [
      'the live version cannot be read',
      {
        status: () => failed,
      },
      'Could not read the live version',
    ],
  ])('fails naming the saved version and the manual command when %s', async (_, on, reason) => {
    const { wrangler, worker } = fakeWrangler(on)
    worker.live = AFTER
    await writeFile(stateFile, BEFORE)

    const failure = await restore(deps(wrangler)).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain(reason)
    expect(String(failure)).toContain(`pnpm exec wrangler rollback ${BEFORE} --yes --message "${MESSAGE}"`)
  })
})

describe('verify', () => {
  it('reads /health, the list, the categories and the first post by its encoded slug', async () => {
    const api = fakeApi()
    await verify('https://api.example.test', SHA, { fetch: api.fetch, timing })
    expect(api.attempts).toEqual({
      '/health': 2,
      '/api/posts': 1,
      '/api/categories': 1,
      '/api/post/first%20post': 1,
    })
  })

  it('keeps polling while /health still reports the previous commit', async () => {
    const api = fakeApi({
      '/health': attempt => Response.json({
        status: 'ok',
        env: 'production',
        commit: attempt < 3
          ? OLD_SHA
          : SHA,
      }),
    })
    await verify('https://api.example.test', SHA, { fetch: api.fetch, timing })
    expect(api.attempts['/health']).toBe(4)
  })

  it('fails when /health never reports the commit within the budget', async () => {
    const api = fakeApi({
      '/health': () => Response.json({ status: 'ok', env: 'production', commit: OLD_SHA }),
    })
    // after three requests, 1 ms of the 1 s budget is left
    await expect(verify('https://api.example.test', SHA, {
      fetch: taking(333, api.fetch),
      timing,
    }))
      .rejects
      .toThrow(`/health (waiting for commit ${SHA}): still failing when the 1s budget ran out (last: commit ${OLD_SHA})`)
    expect(api.attempts['/health']).toBe(3)
    expect(api.attempts['/api/posts']).toBeUndefined()
  })

  it('retries a 5xx, a network error and a hung request', async () => {
    const api = fakeApi({
      '/api/categories': attempt => (attempt === 1
        ? serverError()
        : Response.json({ status: 'success', count: 0, data: [] })),
      '/api/post/first%20post': (attempt) => {
        if (attempt === 1)
          return 'hang'
        if (attempt === 2)
          throw new TypeError('fetch failed')
        return Response.json({
          status: 'success',
          data: { slug: 'first post' },
        })
      },
    })
    await verify('https://api.example.test', SHA, { fetch: api.fetch, timing })
    expect(api.attempts['/api/categories']).toBe(2)
    expect(api.attempts['/api/post/first%20post']).toBe(3)
  })

  it('fails when an endpoint keeps answering 5xx', async () => {
    const api = fakeApi({ '/api/categories': serverError })
    // after five requests, 5 ms of the 1 s budget is left: not enough for another wait
    await expect(verify('https://api.example.test', SHA, {
      fetch: taking(199, api.fetch),
      timing,
    }))
      .rejects
      .toThrow('GET /api/categories: still failing when the 1s budget ran out (last: HTTP 500)')
    expect(api.attempts['/api/categories']).toBe(3)
  })

  it.each([
    [
      'a 4xx',
      '/api/post/first%20post',
      () => Response.json({ status: 'error', message: 'Post not found.' }, { status: 404 }),
      'HTTP 404, not retried',
    ],
    [
      'a wrong envelope',
      '/api/categories',
      () => Response.json({ status: 'error', message: 'x' }),
      'not a success envelope, not retried',
    ],
    [
      'an empty list',
      '/api/posts',
      () => Response.json({ status: 'success', count: 0, data: [] }),
      'listed 0 posts',
    ],
  ])('fails at once on %s', async (_, path, answer, reason) => {
    const api = fakeApi({ [path]: answer })
    await expect(verify('https://api.example.test', SHA, { fetch: api.fetch, timing })).rejects.toThrow(reason)
    expect(api.attempts[path]).toBe(1)
  })

  it('starts over when /health falls back to the previous commit after the reads', async () => {
    const api = fakeApi({
      '/health': attempt => Response.json({
        status: 'ok',
        env: 'production',
        commit: attempt === 2
          ? OLD_SHA
          : SHA,
      }),
    })
    await verify('https://api.example.test', SHA, { fetch: api.fetch, timing })
    expect(api.attempts['/health']).toBe(4)
    expect(api.attempts['/api/posts']).toBe(2)
  })

  it('fails when /health keeps falling back after the reads until the budget runs out', async () => {
    // the new commit before the reads, the previous one after them, for 50
    // rounds: more than the budget covers, and finite so that a verify
    // without the limit ends too (by passing)
    const api = fakeApi({
      '/health': attempt => Response.json({
        status: 'ok',
        env: 'production',
        commit: attempt > 100 || attempt % 2 === 1
          ? SHA
          : OLD_SHA,
      }),
    })
    // the first request takes 5 ms and the others 10 ms each, so the
    // twentieth round ends 5 ms short of the 1 s budget; at 10 ms each it
    // would end exactly on it, and the failure would name a late answer
    const fetch: Fetch = async (url, init) => {
      clock.now += clock.now === 0
        ? 5
        : 10
      return api.fetch(url, init)
    }
    await expect(verify('https://api.example.test', SHA, { fetch, timing }))
      .rejects
      .toThrow(`/health after the reads: still failing when the 1s budget ran out (last: commit ${OLD_SHA})`)
    // five requests a round: the budget covers twenty rounds and no wait after them
    expect(api.attempts['/api/posts']).toBe(20)
    expect(api.attempts['/health']).toBe(40)
  })

  describe('at the end of the budget', () => {
    /**
     * The first four requests take 100 ms each and the fifth, the last
     * /health, ends at `lastEndsAt` of the 1 s budget.
     */
    function lastHealthEndingAt(lastEndsAt: number) {
      const api = fakeApi()
      let sent = 0
      const fetch: Fetch = async (url, init) => {
        sent += 1
        clock.now = sent === 5
          ? lastEndsAt
          : clock.now + 100
        return api.fetch(url, init)
      }
      return { api, fetch }
    }

    /** Makes reading an answer that ended at `from` last until `to`. */
    function parsingTakes(from: number, to: number) {
      const parse = JSON.parse
      vi.spyOn(JSON, 'parse').mockImplementation((text) => {
        if (clock.now === from)
          clock.now = to
        const value: unknown = parse(text)
        return value
      })
    }

    it('counts a last answer that arrives before the budget runs out', async () => {
      const { api, fetch } = lastHealthEndingAt(999)
      await verify('https://api.example.test', SHA, { fetch, timing })
      expect(api.attempts['/health']).toBe(2)
    })

    it.each([
      ['exactly when', 1_000],
      ['after', 1_200],
    ])('does not count a last answer that arrives %s the budget runs out', async (_, lastEndsAt) => {
      const { api, fetch } = lastHealthEndingAt(lastEndsAt)
      await expect(verify('https://api.example.test', SHA, { fetch, timing }))
        .rejects
        .toThrow('/health after the reads: still failing when the 1s budget ran out (last: HTTP 200, after the budget had run out)')
      expect(api.attempts['/health']).toBe(2)
    })

    it('does not report success when reading the last answer uses up the budget', async () => {
      const { api, fetch } = lastHealthEndingAt(999)
      parsingTakes(999, 1_000)
      await expect(verify('https://api.example.test', SHA, { fetch, timing }))
        .rejects
        .toThrow(`/health after the reads: still failing when the 1s budget ran out (last: commit ${SHA}, after the budget had run out)`)
      expect(api.attempts['/health']).toBe(2)
    })

    it('names the last answer when a wait uses up the budget', async () => {
      // reading the answer starts a 1 ms timer that moves the clock to the end
      // of the budget; verify yields to timers only at its 5 ms wait, so the
      // clock jumps during that wait
      const api = fakeApi({
        '/health': () => Response.json({ status: 'ok', env: 'production', commit: OLD_SHA }),
      })
      const fetch: Fetch = async (url, init) => {
        const res = await api.fetch(url, init)
        const body = await res.text()
        return Object.assign(res, {
          text: async () => {
            setTimeout(() => {
              clock.now = 1_000
            }, 1)
            return body
          },
        })
      }
      await expect(verify('https://api.example.test', SHA, { fetch, timing }))
        .rejects
        .toThrow(`/health (waiting for commit ${SHA}): still failing when the 1s budget ran out (last: commit ${OLD_SHA})`)
      expect(api.attempts['/health']).toBe(1)
    })

    it('sends no request once the budget has run out', async () => {
      // the second request, the list, ends at 999 ms and reading it ends exactly when the budget does
      parsingTakes(999, 1_000)
      const api = fakeApi()
      const fetch: Fetch = async (url, init) => {
        clock.now = url.pathname === '/api/posts'
          ? 999
          : clock.now + 100
        return api.fetch(url, init)
      }
      await expect(verify('https://api.example.test', SHA, { fetch, timing }))
        .rejects
        .toThrow('GET /api/categories: still failing when the 1s budget ran out (last: not sent, the budget had run out)')
      expect(api.attempts['/api/posts']).toBe(1)
      expect(api.attempts['/api/categories']).toBeUndefined()
    })
  })
})
