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

/** Verification timing: how long passes may start, pause between passes, cap per request (body included). */
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
const deploymentSchema = z.object({
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
  const deployment = deploymentSchema.safeParse(parseJson(stdout))
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

const healthSchema = z.object({
  commit: z.string().optional(),
})
const postListSchema = z.object({
  status: z.literal('success'),
  data: z.array(z.object({
    slug: z.string(),
  })),
})
const categoryListSchema = z.object({
  status: z.literal('success'),
  data: z.array(z.string()),
})
const onePostSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    slug: z.string(),
  }),
})

/** A failure that may pass a moment later: the pass runs again from the top. */
class Retry extends Error {}

/**
 * One pass: /health reports `sha`, the list, the categories and the first
 * post (the full row, so every column the API selects) are read, and /health
 * still reports `sha`. A pass that meets a network error, a timeout, a 5xx
 * or another answer from /health (the database may be waking up, or the new
 * version is not serving yet) runs again from the top after the interval; a
 * 4xx, a wrong envelope or an empty list fail at once.
 *
 * The budget decides one thing: no pass starts once it has run out. A pass
 * under way runs to its end, so verify can outlast the budget by one pass
 * (five requests, each within the per-request cap) and the wait after it.
 */
export async function verify(baseUrl: string, sha: string, { fetch, timing }: Pick<Deps, 'fetch' | 'timing'>) {
  const deadline = Date.now() + timing.budgetMs

  async function get(path: string) {
    try {
      const signal = AbortSignal.timeout(timing.timeoutMs)
      const res = await fetch(new URL(path, baseUrl), { signal })
      return { status: res.status, body: await res.text() }
    }
    catch (error) {
      throw new Retry(`GET ${path}: ${messageOf(error)}`)
    }
  }

  async function read<T>(path: string, schema: z.ZodType<T>) {
    const { status, body } = await get(path)
    if (status >= 500)
      throw new Retry(`GET ${path}: HTTP ${status}`)
    if (status !== 200)
      throw new Error(`GET ${path}: HTTP ${status}, not retried: ${body.slice(0, 200)}`)
    const parsed = schema.safeParse(parseJson(body))
    if (!parsed.success)
      throw new Error(`GET ${path}: not a success envelope, not retried: ${body.slice(0, 200)}`)
    return parsed.data
  }

  async function expectCommit() {
    const { status, body } = await get('/health')
    const health = healthSchema.safeParse(parseJson(body))
    if (status !== 200 || !health.success)
      throw new Retry(`GET /health: HTTP ${status}`)
    if (health.data.commit !== sha)
      throw new Retry(`GET /health: commit ${health.data.commit ?? '(none)'}, not ${sha}`)
  }

  async function pass() {
    await expectCommit()
    const { data: posts } = await read('/api/posts', postListSchema)
    const [first] = posts
    if (!first)
      throw new Error('GET /api/posts: listed 0 posts')
    await read('/api/categories', categoryListSchema)
    await read(`/api/post/${encodeURIComponent(first.slug)}`, onePostSchema)
    await expectCommit()
    return `/health, ${posts.length} posts, categories, /api/post/${first.slug}`
  }

  for (;;) {
    try {
      console.info(`Verified ${sha} at ${baseUrl}: ${await pass()}.`)
      return
    }
    catch (error) {
      if (!(error instanceof Retry))
        throw error
      console.info(`  ${error.message}`)
      await sleep(timing.intervalMs)
      // checked after the wait, which can overrun on a busy runner: no pass
      // starts past the deadline, and the failure names the last real answer
      if (Date.now() >= deadline)
        throw new Error(`Not verified within ${timing.budgetMs / 1000}s (last: ${error.message})`)
    }
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

const TIMING: Timing = { budgetMs: 90_000, intervalMs: 3_000, timeoutMs: 10_000 }

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
      timing: TIMING,
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
      timing: TIMING,
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
