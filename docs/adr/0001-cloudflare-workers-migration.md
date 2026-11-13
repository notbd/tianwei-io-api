# ADR-0001: Migrate the API from fly.io (Node.js) to Cloudflare Workers

- **Status**: Accepted (2026-07)
- **Repos affected**: tianwei-io-api; consumers unchanged by design

## Context

The API ran as a Hono + Node.js server on a fly.io machine. At personal-blog
traffic, the machine idles and auto-stops; the first request after idle paid
a multi-second wake-up. That cold start compounded with Neon's scale-to-zero
and was the API-side share of the "posts pages feel slow" problem. Operating
it also meant owning a Dockerfile, pooling configuration, signal handling
and an in-memory rate limiter with an unbounded store.

## Decision

Rewrite for Cloudflare Workers, keeping the wire contract's JSON
structurally identical (verified with `scripts/smoke.mjs` against the fly
deployment).

Sub-decisions:

- **DB driver: `@neondatabase/serverless` (HTTP) + `drizzle-orm/neon-http`.**
  Every endpoint is exactly one read-only query, so the one-fetch-per-query
  model fits perfectly; no pool, no TCP, no cleanup. Hyperdrive was
  rejected: it earns its complexity only for multi-query/transactional
  workloads. Smart Placement is on so the Worker can move next to Neon;
  at this traffic it stays where requests arrive, which is fine because
  the main caller (Vercel functions in iad1) already sits next to Neon
  (note below).
- **Rate limiting: platform, not application.** A per-isolate in-memory
  Map is meaningless on Workers (one counter per isolate per colo). One
  Cloudflare zone rate-limiting rule is meant to replace all of it with
  zero code; whether it is set up is in the [README](../../README.md)
  (How It Works).
- **`Cache-Control: no-store` on `/api/*`.** The frontend's Next.js data
  cache (revalidate: false + on-demand invalidation) is the single
  cache layer in the system. Any edge/API cache here would serve stale
  content after a sync (see the frontend repo's ADR on the single cache
  layer).
- **`PostsRepo` interface between handlers and Drizzle.** Contract tests
  inject fakes to pin exact JSON shapes; SQL behavior is tested separately
  against PGlite. This is what keeps the contract's exact JSON checkable.
- **Per-request env parsing.** Workers has no boot phase; bindings are
  validated per request with Zod, memoized per isolate on the bindings
  object.

## Consequences

- Cold starts drop from seconds (machine wake) to milliseconds (isolate).
- No Docker, no pool tuning, no graceful-shutdown code: deleted, not ported.
- Environment misconfiguration now surfaces as per-request 500s instead of
  a failed boot; the deploy's verification covers this (`/health` must
  report the new commit and the list, the categories and one post must
  read, or the previous version is restored; README, Deploy).
- Local dev needs a Neon dev branch (the HTTP driver cannot reach a local
  TCP Postgres); documented in `.dev.vars.example`.

---

Note (2026-10-31): live responses carry `cf-placement: local-<colo>`, so Smart
Placement is not relocating the Worker (it needs sustained traffic from several
locations). The outcome is the same because the main caller, Vercel's ISR
functions in the default `iad1` region (us-east-1), already sits next to Neon
(Vercel does not document where builds run).

The migration was executed on 2026-07-07 (api #5, #13); its step-by-step
runbook is in the git history of `docs/cutover.md`.
