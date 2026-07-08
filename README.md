<!-- markdownlint-disable MD007 MD033 MD041 -->
<samp>
<h1>tianwei-io-api</h1>

[![CI](https://github.com/notbd/tianwei-io-api/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/notbd/tianwei-io-api/actions/workflows/ci.yml)
[![Deploy](https://github.com/notbd/tianwei-io-api/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/notbd/tianwei-io-api/actions/workflows/deploy.yml)

The API layer of my personal website [tianwei.io](https://tianwei.io), serving at `tio.twz.app`.

<h2>Stack</h2>

- **Framework**: [Hono](https://hono.dev)
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com)
- **Database**: [PostgreSQL](https://www.postgresql.org/) on [Neon](https://neon.tech), via the [neon-http](https://neon.tech/docs/serverless/serverless-driver) driver
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Validation**: [Zod](https://zod.dev)
- **Testing**: [Vitest](https://vitest.dev) + [PGlite](https://pglite.dev) (in-memory Postgres)

<h2>Site Architecture</h2>

- **[Frontend](https://github.com/notbd/tianwei.io)**: a Next.js application rendering content from the API with static generation and on-demand revalidation.
- **[API Layer](https://github.com/notbd/tianwei-io-api)**: this repo — a Hono service on Cloudflare Workers serving content data via REST endpoints.
- **[Content Engine](https://github.com/notbd/tianwei-io-content)**: a dedicated repo that stores, parses and syncs MDX to a remote PostgreSQL database.

<h2>Design Notes</h2>

- **Stateless by construction**: every request is one HTTP query to Neon — no pools, no sockets, no shutdown hooks. The Worker runs with smart placement, so it executes near the database rather than near the caller.
- **No API-level caching** (`Cache-Control: no-store`): the frontend's Next.js data cache with on-demand revalidation is the single cache layer; caching here too would serve stale data after a content sync.
- **Rate limiting** is delegated to a Cloudflare zone rule instead of application code — the old in-memory limiter is meaningless across Worker isolates.
- **Repository boundary**: handlers depend on a `PostsRepo` interface; production wires Drizzle over neon-http, tests inject fakes (contract tests) or PGlite (SQL tests).

<h2>Endpoints</h2>

- `GET /` - Root endpoint (returns greeting)
- `GET /health` - Health check endpoint
- `GET /api/posts` - List all published posts (summary shape, newest first)
- `GET /api/categories` - List distinct categories of published posts
- `GET /api/post/:slug` - Get a single post by slug (full content)
- `GET /api/__dev/posts` - Dev-only endpoint (includes unpublished posts); answers the standard 404 in production
- `GET /api/__preview/post/:slug` - Draft preview for the frontend's draftMode; requires `Authorization: Bearer <PREVIEW_SECRET>` and is indistinguishable from a 404 unless the secret is configured

All API endpoints return JSON responses with a consistent structure:

- Success: `{ status: "success", data: ... }` (lists add `count`)
- Error: `{ status: "error", message: ... }`

<h2>Local Run</h2>

Prerequisites: **Node.js ≥ 22** and **pnpm 10**.

```shell
git clone git@github.com:notbd/tianwei-io-api.git
cd tianwei-io-api
pnpm install

# Copy .dev.vars.example to .dev.vars and point DATABASE_URL
# at a Neon dev branch, then:
pnpm dev
```

<h2>Testing</h2>

```shell
pnpm test        # contract tests (exact JSON shapes) + repo tests (real SQL on PGlite)
pnpm typecheck
pnpm lint
```

The contract suite pins the exact wire format the frontend depends on — endpoint envelopes, error messages, slug validation, CORS and cache headers. The repo suite runs the real queries against an in-memory Postgres.

For deploy verification, `pnpm smoke <baseline-url> <candidate-url>` diffs every endpoint between two live deployments (byte-identical, modulo explicitly allowed additive fields). The fly.io → Workers migration itself followed [`docs/cutover.md`](./docs/cutover.md).

> **Contract evolution rule**: this Worker selects every column its schema declares, so a new column must land in the database (merge + deploy tianwei-io-content) **before** the Worker's schema references it — additive changes always flow content → api → frontend. (Example: `updated_at`, added at the 2026-07 cutover.)

<h2>Configuration</h2>

- `NODE_ENV`, `ALLOWED_ORIGINS`: plain vars in `wrangler.jsonc` (production) / `.dev.vars` (local)
- `DATABASE_URL`: Worker secret — `pnpm wrangler secret put DATABASE_URL`
- `PREVIEW_SECRET` (optional): Worker secret enabling the draft-preview endpoint
- CI deploys on push to `main` via `cloudflare/wrangler-action` (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets)

Design records live in [`docs/adr/`](./docs/adr/).

<h2>License</h2>

Source code is licensed under <a href='./LICENSE'>AGPLv3</a>,<br>
The content is licensed under <a href='https://creativecommons.org/licenses/by-nc-sa/4.0/'>CC BY-NC-SA 4.0</a>.
</samp>
