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

Rewrite for Cloudflare Workers, keeping the wire contract byte-identical
(verified with `scripts/smoke.mjs` against the fly deployment).

Sub-decisions:

- **DB driver: `@neondatabase/serverless` (HTTP) + `drizzle-orm/neon-http`.**
  Every endpoint is exactly one read-only query, so the one-fetch-per-query
  model fits perfectly; no pool, no TCP, no cleanup. Hyperdrive was
  rejected: it earns its complexity only for multi-query/transactional
  workloads. Smart placement runs the Worker near Neon instead of near the
  caller — with a single round trip, DB proximity wins.
- **Rate limiting: platform, not application.** A per-isolate in-memory
  Map is meaningless on Workers (one counter per isolate per colo). One
  Cloudflare zone rate-limiting rule replaces all of it with zero code.
- **`Cache-Control: no-store` on `/api/*`.** The frontend's Next.js data
  cache (revalidate:false + on-demand invalidation + warming) is the single
  cache layer in the system. Any edge/API cache here would serve stale
  content after a sync — see the frontend repo's ADR on the single cache
  layer.
- **`PostsRepo` interface between handlers and Drizzle.** Contract tests
  inject fakes to pin exact JSON shapes; SQL behavior is tested separately
  against PGlite. This is what keeps "byte-identical contract" checkable.
- **Per-request env parsing.** Workers has no boot phase; bindings are
  validated per request with Zod, memoized per isolate on the bindings
  object.

## Consequences

- Cold starts drop from seconds (machine wake) to milliseconds (isolate).
- No Docker, no pool tuning, no graceful-shutdown code — deleted, not ported.
- Environment misconfiguration now surfaces as per-request 500s instead of
  a failed boot; the deploy pipeline's smoke check covers this.
- Local dev needs a Neon dev branch (the HTTP driver cannot reach a local
  TCP Postgres); documented in `.dev.vars.example`.
