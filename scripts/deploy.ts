/**
 * Production deploy of the Worker, run by .github/workflows/deploy.yml.
 *
 *   node scripts/deploy.ts check               wrangler starts (no credentials needed)
 *   node scripts/deploy.ts release <sha>       save the live version, deploy <sha>, verify it
 *   node scripts/deploy.ts restore             after a failed release: back to the saved version
 *   node scripts/deploy.ts verify <url> <sha>  release's verification on its own
 *
 * The new version takes traffic before it is verified; when the release
 * fails, restore puts back the version that was live before it. Node runs
 * this file as is (type stripping), hence erasable syntax only and no `@/`
 * imports.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'

/** The Worker's custom domain (`routes` in wrangler.jsonc). */
const PRODUCTION_URL = 'https://tio.twz.app'

const ROLLBACK_MESSAGE = 'Restore after a failed deploy'

/** `pnpm exec wrangler <args>`: stdout is returned when captured, else it streams to the log. */
export type Wrangler = (args: string[], options?: { capture?: boolean }) => Promise<{ code: number, stdout: string }>

export type Fetch = (url: URL, init: { signal: AbortSignal }) => Promise<Response>

/** Verification timing: total budget, pause between attempts, cap per request (body included). */
export type Timing = { budgetMs: number, intervalMs: number, timeoutMs: number }

export type Deps = {
  wrangler: Wrangler
  fetch: Fetch
  /** Where release saves the pre-deploy version for restore. */
  stateFile: string
  timing: Timing
}

/**
 * The real launcher. An argument array and no shell, so nothing in the
 * arguments is interpreted; through pnpm, because node_modules/.bin is not on
 * a workflow step's PATH. stdin is closed, which makes wrangler
 * non-interactive: its prompts take their defaults.
 */
export const runWrangler: Wrangler = async (args, { capture = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn('pnpm', ['exec', 'wrangler', ...args], {
    stdio: [
      'ignore',
      capture ? 'pipe' : 'inherit',
      'inherit',
    ],
  })
  let stdout = ''
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
  })
  child.on('error', reject)
  child.on('close', code => resolve({ code: code ?? 1, stdout }))
})

/** Proves the launcher reaches wrangler: `--version` must print a version number. */
export async function check(wrangler: Wrangler) {
  const { code, stdout } = await wrangler(['--version'], { capture: true })
  const version = stdout.trim()
  if (code !== 0 || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`wrangler --version exited with code ${code} and printed ${JSON.stringify(stdout)}`)
  console.info(`wrangler ${version}`)
}

// The latest deployment as Cloudflare's API returns it; `deployments status
// --json` prints it whole (it also holds the account email, so it is
// captured, never logged).
const Deployment = z.object({
  versions: z.array(z.object({
    version_id: z.string(),
    percentage: z.number(),
  })),
})

/** The version serving all traffic. Throws unless exactly one version is at 100%. */
export async function liveVersion(wrangler: Wrangler) {
  const { code, stdout } = await wrangler(['deployments', 'status', '--json'], { capture: true })
  if (code !== 0)
    throw new Error(`wrangler deployments status exited with code ${code}`)
  const deployment = Deployment.safeParse(parseJson(stdout))
  if (!deployment.success)
    throw new Error('wrangler deployments status did not print a deployment as JSON')
  const { versions } = deployment.data
  const [live, ...others] = versions.filter(version => version.percentage === 100)
  if (!live || others.length > 0) {
    const split = versions.map(version => `${version.version_id} at ${version.percentage}%`).join(', ')
    throw new Error(`expected one version at 100% of traffic, found: ${split || 'none'}`)
  }
  return live.version_id
}

/** Saves the live version, deploys `sha` (reported by /health as `commit`) and verifies it. */
export async function release(sha: string, deps: Deps) {
  const before = await liveVersion(deps.wrangler)
  // Written before the deploy starts: restore treats a missing file as
  // "nothing was deployed".
  await writeFile(deps.stateFile, before)
  console.info(`Live version before the deploy: ${before}`)

  const { code } = await deps.wrangler(['deploy', '--var', `COMMIT_SHA:${sha}`])
  if (code !== 0)
    throw new Error(`wrangler deploy exited with code ${code}`)

  await verify(PRODUCTION_URL, sha, deps)
}

/**
 * Puts the version saved by release back, if the live one differs. A missing
 * state file means release stopped before deploying: nothing to do. Any
 * failure names the saved version and the command that restores it by hand.
 */
export async function restore({ wrangler, stateFile }: Pick<Deps, 'wrangler' | 'stateFile'>) {
  if (!existsSync(stateFile)) {
    console.info('No saved version: the release stopped before deploying. Nothing to restore.')
    return
  }
  const saved = (await readFile(stateFile, 'utf8')).trim()
  const manualRollback = `pnpm exec wrangler rollback ${saved} --yes --message "${ROLLBACK_MESSAGE}"`
  const failure = (reason: string) =>
    new Error(`${reason}. The version live before this deploy was ${saved}; restore it by hand: ${manualRollback}`)
  const readLive = async () => liveVersion(wrangler).catch((error: unknown) => {
    throw failure(`Could not read the live version (${messageOf(error)})`)
  })

  const current = await readLive()
  if (current === saved) {
    console.info(`${saved} is still live. Nothing to restore.`)
    return
  }

  console.info(`${current} is live; rolling back to ${saved}.`)
  const { code } = await wrangler([
    'rollback',
    saved,
    '--yes',
    '--message',
    ROLLBACK_MESSAGE,
  ])
  if (code !== 0)
    throw failure(`wrangler rollback exited with code ${code}`)

  // A declined confirmation exits 0 without rolling back, so check.
  const after = await readLive()
  if (after !== saved)
    throw failure(`After the rollback ${after} is live, not ${saved}`)
  console.info(`Rolled back: ${saved} is live again.`)
}

const Health = z.object({
  commit: z.string().optional(),
})
const PostList = z.object({
  status: z.literal('success'),
  data: z.array(z.object({
    slug: z.string(),
  })),
})
const CategoryList = z.object({
  status: z.literal('success'),
  data: z.array(z.string()),
})
const OnePost = z.object({
  status: z.literal('success'),
  data: z.object({
    slug: z.string(),
  }),
})

/**
 * Waits for /health to report `sha`, then reads the list, the categories and
 * the first post (the full row, so every column the API selects), then
 * confirms /health still reports `sha`; if it does not, starts over. Network
 * errors and 5xx are retried within the budget (the database may be waking
 * up); a 4xx, a wrong envelope or an empty list fail at once.
 *
 * The budget is a hard limit on every path: no request is sent once it has
 * run out, an answer that arrives after it does not count, success is only
 * reported while some of it is left, and every way back to an earlier step
 * goes through `retry`, which waits out the interval or fails.
 */
export async function verify(baseUrl: string, sha: string, { fetch, timing }: Pick<Deps, 'fetch' | 'timing'>) {
  const deadline = Date.now() + timing.budgetMs
  /** What is left of the budget; at 0 or less it has run out. */
  const left = () => deadline - Date.now()

  /**
   * One GET, given the per-request cap or what is left of the budget,
   * whichever is less; a network error, a timeout, a spent budget or an
   * answer that came after the budget ran out comes back as `error`.
   */
  async function get(path: string): Promise<{ status: number, body: string } | { error: string }> {
    const budgetLeft = left()
    if (budgetLeft <= 0)
      return { error: 'not sent, the budget had run out' }
    try {
      const signal = AbortSignal.timeout(Math.min(timing.timeoutMs, budgetLeft))
      const res = await fetch(new URL(path, baseUrl), { signal })
      const body = await res.text()
      // the signal is a request to stop, not a guarantee the answer came in time
      if (left() <= 0)
        return { error: `HTTP ${res.status}, after the budget had run out` }
      return { status: res.status, body }
    }
    catch (error) {
      return {
        error: messageOf(error),
      }
    }
  }

  /**
   * Waits out the interval, or fails once the budget cannot cover another
   * attempt. Checked again after the wait, which can overrun on a busy
   * runner, so that the failure names the last answer and not a request
   * that was never sent.
   */
  async function retry(step: string, last: string) {
    const spent = () => new Error(`${step}: still failing when the ${timing.budgetMs / 1000}s budget ran out (last: ${last})`)
    if (left() <= timing.intervalMs)
      throw spent()
    console.info(`  ${step}: ${last}; retrying`)
    await sleep(timing.intervalMs)
    if (left() <= 0)
      throw spent()
  }

  async function reportedCommit() {
    const reply = await get('/health')
    if ('error' in reply)
      return { last: reply.error }
    const health = reply.status === 200
      ? Health.safeParse(parseJson(reply.body))
      : undefined
    return health?.success
      ? { commit: health.data.commit, last: `commit ${health.data.commit ?? '(none)'}` }
      : { last: `HTTP ${reply.status}` }
  }

  async function read<T>(path: string, schema: z.ZodType<T>) {
    const step = `GET ${path}`
    for (;;) {
      const reply = await get(path)
      if ('error' in reply) {
        await retry(step, reply.error)
        continue
      }
      if (reply.status >= 500) {
        await retry(step, `HTTP ${reply.status}`)
        continue
      }
      if (reply.status !== 200)
        throw new Error(`${step}: HTTP ${reply.status}, not retried: ${reply.body.slice(0, 200)}`)
      const parsed = schema.safeParse(parseJson(reply.body))
      if (!parsed.success)
        throw new Error(`${step}: not a success envelope, not retried: ${reply.body.slice(0, 200)}`)
      return parsed.data
    }
  }

  for (;;) {
    for (;;) {
      const { commit, last } = await reportedCommit()
      if (commit === sha)
        break
      await retry(`/health (waiting for commit ${sha})`, last)
    }

    const { data: posts } = await read('/api/posts', PostList)
    const [first] = posts
    if (!first)
      throw new Error('GET /api/posts: listed 0 posts')
    await read('/api/categories', CategoryList)
    await read(`/api/post/${encodeURIComponent(first.slug)}`, OnePost)

    const { commit, last } = await reportedCommit()
    // the only way out with a success: reading the answer takes time too,
    // so the budget is checked once more right here
    if (commit === sha && left() > 0) {
      console.info(`Verified ${sha} at ${baseUrl}: /health, ${posts.length} posts, categories, /api/post/${first.slug}.`)
      return
    }
    await retry('/health after the reads', commit === sha
      ? `${last}, after the budget had run out`
      : last)
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

function messageOf(error: unknown): string {
  if (!(error instanceof Error))
    return String(error)
  // fetch's "fetch failed" hides the reason (refused, DNS) in `cause`
  return error.cause instanceof Error
    ? `${error.message} (${error.cause.message})`
    : error.message
}

const DEFAULT_TIMING: Timing = { budgetMs: 90_000, intervalMs: 3_000, timeoutMs: 10_000 }

/**
 * Production timing, which the local rehearsal shortens through
 * DEPLOY_VERIFY_BUDGET_MS, DEPLOY_VERIFY_INTERVAL_MS and
 * DEPLOY_VERIFY_TIMEOUT_MS. They can only shorten it; CI never sets them.
 */
function timingFromEnv(env: NodeJS.ProcessEnv): Timing {
  const ms = (name: string, max: number) => {
    const value = env[name]
    if (value === undefined)
      return max
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
      throw new Error(`${name}=${value}: expected whole milliseconds from 1 to ${max}`)
    return parsed
  }
  return {
    budgetMs: ms('DEPLOY_VERIFY_BUDGET_MS', DEFAULT_TIMING.budgetMs),
    intervalMs: ms('DEPLOY_VERIFY_INTERVAL_MS', DEFAULT_TIMING.intervalMs),
    timeoutMs: ms('DEPLOY_VERIFY_TIMEOUT_MS', DEFAULT_TIMING.timeoutMs),
  }
}

const USAGE = `Usage:
  node scripts/deploy.ts check
  node scripts/deploy.ts release <sha>
  node scripts/deploy.ts restore
  node scripts/deploy.ts verify <base-url> <sha>`

async function main([command, ...args]: string[]) {
  // release and restore share one file per job; RUNNER_TEMP is emptied
  // between jobs, so restore never sees another run's version.
  const stateFile = () => {
    const runnerTemp = process.env.RUNNER_TEMP
    if (runnerTemp === undefined || runnerTemp === '')
      throw new Error('RUNNER_TEMP is unset: release and restore run inside GitHub Actions')
    return join(runnerTemp, 'worker-version-before')
  }
  const [first = '', second = ''] = args

  if (command === 'check' && args.length === 0)
    return check(runWrangler)
  if (command === 'release' && args.length === 1 && first !== '') {
    return release(first, {
      wrangler: runWrangler,
      fetch,
      stateFile: stateFile(),
      timing: timingFromEnv(process.env),
    })
  }
  if (command === 'restore' && args.length === 0) {
    return restore({
      wrangler: runWrangler,
      stateFile: stateFile(),
    })
  }
  if (command === 'verify' && args.length === 2 && first !== '' && second !== '') {
    return verify(first, second, {
      fetch,
      timing: timingFromEnv(process.env),
    })
  }
  console.error(USAGE)
  process.exitCode = 2
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(messageOf(error))
    process.exitCode = 1
  })
}
