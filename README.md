<!-- markdownlint-disable MD007 MD033 MD041 -->
<samp>
<h1>tianwei-io-api</h1>

[![CI](https://github.com/notbd/tianwei-io-api/actions/workflows/ci.yml/badge.svg)](https://github.com/notbd/tianwei-io-api/actions/workflows/ci.yml)
[![Deploy](https://github.com/notbd/tianwei-io-api/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/notbd/tianwei-io-api/actions/workflows/deploy.yml)

The API layer of my personal website [tianwei.io](https://tianwei.io), served at `tio.twz.app`.

<h2>Stack</h2>

- **Framework**: [Hono](https://hono.dev)
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com)
- **Database**: [PostgreSQL](https://www.postgresql.org/) on [Neon](https://neon.com), via the [neon-http](https://neon.com/docs/serverless/serverless-driver) driver
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Validation**: [Zod](https://zod.dev)
- **Testing**: [Vitest](https://vitest.dev) + [PGlite](https://pglite.dev) (in-memory Postgres)

<h2>Site Architecture</h2>

The site is split into three repos, each deployed on its own:

- **[Frontend](https://github.com/notbd/tianwei.io)**: a Next.js app that renders every page as static HTML from data it fetches through the API.
- **[API Layer](https://github.com/notbd/tianwei-io-api)** (this repo): a read-only REST API on Cloudflare Workers that serves the published posts from Postgres.
- **[Content Engine](https://github.com/notbd/tianwei-io-content)**: the posts themselves, written in MDX, validated and synced into Postgres on Neon.

A post goes live in three steps:

1. A push to `main` in the content engine syncs every post into Postgres in one transaction.
2. The same deploy calls the frontend's `/api/revalidate`.
3. The frontend expires its cached data and renders the pages again through this API.

The frontend's data cache is the only cache in the system (this API does not cache), so step 2 is the one place where new content takes effect. Three services is more than a personal site needs; I split it on purpose, to practice what only exists between services: API contracts, independent deploys and cache invalidation across repos ([tianwei.io ADR-0001](https://github.com/notbd/tianwei.io/blob/main/docs/adr/0001-three-tier-architecture.md)).

<h2>How It Works</h2>

- **Read-only**: the content engine owns the schema and every write; this API serves published posts, and drafts only to the frontend's draft preview (which presents a secret) or in local development.
- **Stateless**: each data request is one HTTP query to Neon, so there are no connection pools, sockets or shutdown hooks to manage on Workers. Smart Placement is on; where the Worker actually runs, and why that is fine, is in [ADR-0001](./docs/adr/0001-cloudflare-workers-migration.md).
- **No caching**: every `/api` response carries `Cache-Control: no-store`, so a content sync never waits on an edge or browser cache.
- **One error path**: `src/routes/posts.ts` holds the public reads and `src/routes/drafts.ts` the two that include drafts. A failed read throws an `HTTPException` with the endpoint's public message, and `app.onError` logs the cause once and answers the error envelope.
- **Testable data access**: handlers depend on a `PostsRepo` interface; production wires Drizzle over neon-http, and tests inject fakes or PGlite.
- **Rate limiting** belongs in a Cloudflare rule in front of the Worker (configured in the dashboard, not tracked in this repo), not in application code: an in-memory counter means nothing across Worker isolates.

<h2>Endpoints</h2>

| Endpoint | Returns |
| --- | --- |
| `GET /api/posts` | Published posts, newest first, without their content |
| `GET /api/categories` | The categories that have published posts |
| `GET /api/post/:slug` | One published post, with its MDX content |
| `GET /api/__preview/post/:slug` | One post, drafts included, for the frontend's draft preview; needs `Authorization: Bearer <PREVIEW_SECRET>` and answers 404 when no secret is configured |
| `GET /api/__dev/posts` | Every post, drafts included; local development only (404 in production) |
| `GET /health` | `{"status": "ok", "env": "production"}` |
| `GET /` | A greeting |

Every `/api` response is JSON in one envelope: `{"status": "success", "data": ...}` (lists add `count`) or `{"status": "error", "message": ...}`. Contract tests here and in the frontend pin these shapes exactly.

<h2>Local Run</h2>

Prerequisites: **Node.js 26** (see `.nvmrc`), **pnpm 10** and a Neon database branch (the neon-http driver cannot reach a plain local Postgres).

```shell
git clone git@github.com:notbd/tianwei-io-api.git
cd tianwei-io-api
pnpm install
cp .dev.vars.example .dev.vars   # then set DATABASE_URL to a Neon dev branch
pnpm dev                         # wrangler dev on http://127.0.0.1:8787
```

<h2>Configuration</h2>

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Plain variable (`wrangler.jsonc` in production, `.dev.vars` locally); `development` turns on `/api/__dev/posts` |
| `ALLOWED_ORIGINS` | Plain variable, comma-separated CORS origins; empty in production, since the frontend calls the API from its server |
| `DATABASE_URL` | Worker secret (`pnpm wrangler secret put DATABASE_URL`): the Neon connection string |
| `PREVIEW_SECRET` (optional) | Worker secret that enables the preview endpoint; must match the frontend's. A value shorter than 16 characters only disables preview and logs why; the public endpoints keep working |

`worker-configuration.d.ts` holds the Workers runtime types `src/` is checked against; regenerate it with `pnpm cf-typegen` after bumping `wrangler` or `compatibility_date`.

<h2>Quality Gates</h2>

```shell
pnpm lint
pnpm typecheck
pnpm test    # contract tests (exact JSON responses) + repo tests (real SQL on PGlite)
pnpm smoke <baseline-url> <candidate-url>
```

`pnpm smoke` compares every endpoint between two deployments, such as production and a local `wrangler dev` (with `NODE_ENV=production` in `.dev.vars`) before a release: status codes, and bodies as JSON with key order ignored. CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every pull request.

<h2>Deploy</h2>

A push to `main` runs the checks again, deploys with `cloudflare/wrangler-action` (repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`), then checks that `/health` and `/api/posts` answer on `tio.twz.app`.

> **Contract rule**: the Worker selects every column its schema declares, so a new column must reach the database (merge and deploy tianwei-io-content) before the Worker's schema references it. Changes that span repos ship content → API → frontend, additive first.

Design records are in [`docs/adr/`](./docs/adr/).

<h2>License</h2>

Source code is licensed under <a href='./LICENSE'>AGPLv3</a>.<br>
The content is licensed under <a href='https://creativecommons.org/licenses/by-nc-sa/4.0/'>CC BY-NC-SA 4.0</a>.
</samp>
