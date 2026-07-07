#!/usr/bin/env node
/**
 * Cutover smoke test: byte-diff every endpoint between two deployments.
 *
 * Usage:
 *   node scripts/smoke.mjs <baseline-url> <candidate-url>
 *   node scripts/smoke.mjs https://tio.twz.app https://tianwei-io-api.<acct>.workers.dev
 *
 * Compares status codes and exact response bodies (the wire contract the
 * frontend parses). Headers are informational only — platforms add their own.
 */

import process from 'node:process'

const [baselineBase, candidateBase] = process.argv.slice(2)

if (!baselineBase || !candidateBase) {
  console.error('Usage: node scripts/smoke.mjs <baseline-url> <candidate-url>')
  process.exit(2)
}

// Fields either side is allowed to have that the other may lack
// (additive contract evolution, e.g. updatedAt introduced with the
// Workers migration). Stripped from BOTH sides before comparison, so the
// script also works once the baseline itself serves the new field
// (e.g. re-running against workers.dev during the domain switch).
const ALLOWED_NEW_FIELDS = new Set(['updatedAt'])

// Key-order-independent canonical form: sorted keys + allowed additive
// fields removed. JSON.stringify alone would be order-sensitive and fail
// on structurally identical bodies serialized by different codebases.
function canonicalize(value) {
  if (Array.isArray(value))
    return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ALLOWED_NEW_FIELDS.has(key))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, canonicalize(inner)]),
    )
  }
  return value
}

function bodiesMatch(baselineBody, candidateBody) {
  if (candidateBody === baselineBody)
    return true
  // JSON bodies: compare structurally, ignoring allowed additive fields
  try {
    const baselineJson = JSON.parse(baselineBody)
    const candidateJson = JSON.parse(candidateBody)
    return JSON.stringify(canonicalize(baselineJson)) === JSON.stringify(canonicalize(candidateJson))
  }
  catch {
    return false
  }
}

const CHECKS = [
  { path: '/', expectStatus: 200 },
  { path: '/health', expectStatus: 200, ignoreBody: true }, // env name may differ pre-cutover
  { path: '/api/posts', expectStatus: 200 },
  { path: '/api/categories', expectStatus: 200 },
  { path: '/api/post/__FIRST_SLUG__', expectStatus: 200 },
  { path: '/api/post/does-not-exist-hopefully', expectStatus: 404 },
  { path: '/api/post/INVALID_SLUG', expectStatus: 400 },
  { path: '/api/post/double--hyphen', expectStatus: 400 },
  { path: `/api/post/${'a'.repeat(201)}`, expectStatus: 400 },
  { path: '/api/__dev/posts', expectStatus: 404 },
  { path: '/api/nope', expectStatus: 404 },
]

async function fetchBody(base, path) {
  const res = await fetch(new URL(path, base))
  return { status: res.status, body: await res.text() }
}

// Resolve a real slug from the baseline so the single-post check uses live data
async function firstSlug() {
  const res = await fetch(new URL('/api/posts', baselineBase))
  if (!res.ok)
    throw new Error(`Baseline /api/posts responded ${res.status} — cannot resolve a post slug`)
  const json = await res.json()
  const slug = json?.data?.[0]?.slug
  if (!slug)
    throw new Error('Could not resolve a post slug from the baseline /api/posts')
  return slug
}

let failures = 0
const slug = await firstSlug()

for (const check of CHECKS) {
  const path = check.path.replace('__FIRST_SLUG__', slug)
  const [baseline, candidate] = await Promise.all([
    fetchBody(baselineBase, path),
    fetchBody(candidateBase, path),
  ])

  const bodyMatches = check.ignoreBody || bodiesMatch(baseline.body, candidate.body)

  const problems = []
  if (baseline.status !== check.expectStatus)
    problems.push(`baseline status ${baseline.status} != expected ${check.expectStatus}`)
  if (candidate.status !== baseline.status)
    problems.push(`status mismatch: baseline ${baseline.status} vs candidate ${candidate.status}`)
  if (!bodyMatches)
    problems.push(`body mismatch (${baseline.body.length}B vs ${candidate.body.length}B)`)

  if (problems.length > 0) {
    failures += 1
    console.error(`✗ ${path}\n    ${problems.join('\n    ')}`)
    if (!bodyMatches) {
      console.error(`    baseline:  ${baseline.body.slice(0, 200)}`)
      console.error(`    candidate: ${candidate.body.slice(0, 200)}`)
    }
  }
  else {
    console.info(`✓ ${path} (${baseline.status}, ${baseline.body.length}B)`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.info('\nAll checks passed — contract matches (modulo allowed additive fields).')
