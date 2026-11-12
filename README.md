<!-- markdownlint-disable MD007 MD033 MD041 -->
<samp>
<h1>tianwei-io-api</h1>

[![Deploy](https://github.com/notbd/tianwei-io-api/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/notbd/tianwei-io-api/actions/workflows/deploy.yml)

The API layer of my personal website [tianwei.io](https://tianwei.io), served at [tio.twz.app](https://tio.twz.app).

<h2>Stack</h2>

- **Framework**: [Hono](https://hono.dev)
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com)
- **Database**: [PostgreSQL](https://www.postgresql.org/) on [Neon](https://neon.com), via the [neon-http](https://neon.com/docs/serverless/serverless-driver) driver
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Validation**: [Zod](https://zod.dev)
- **Testing**: [Vitest](https://vitest.dev) + [PGlite](https://pglite.dev) (in-memory Postgres)

<h2>Site Architecture</h2>

This is the API, one of the three repos behind the site, next to the [frontend](https://github.com/notbd/tianwei.io) and the [content engine](https://github.com/notbd/tianwei-io-content). How the three fit together, with a diagram, is in [the frontend's README](https://github.com/notbd/tianwei.io/blob/main/README.md).

<h2>How It Works</h2>

- **Read-only**: the content engine owns the schema and every write; this API serves published posts, and drafts only to the frontend's draft preview (which presents a secret) or in local development.
- **Stateless**: each data request is one HTTP query to Neon, so there are no connection pools, sockets or shutdown hooks to manage on Workers. Smart Placement is on; where the Worker actually runs, and why that is fine, is in [ADR-0001](./docs/adr/0001-cloudflare-workers-migration.md).
- **No caching**: every `/api` response carries `Cache-Control: no-store`, so a content sync never waits on an edge or browser cache.
- **One error path**: a failed read throws an `HTTPException` that carries the endpoint's public message; `app.onError` logs the cause once and answers with the error envelope.
- **Testable data access**: handlers depend on a `PostsRepo` interface; production wires Drizzle over neon-http, and tests inject fakes or PGlite.
- **Rate limiting** is meant for a Cloudflare rule in front of the Worker, not application code (an in-memory counter means nothing across Worker isolates); the rule is not set up yet.

<h2>Endpoints</h2>

| Endpoint | Returns |
| --- | --- |
| `GET /api/posts` | Published posts, newest first, without their content |
| `GET /api/categories` | The categories that have published posts |
| `GET /api/post/:slug` | One published post, with its MDX content |
| `GET /api/__preview/post/:slug` | One post, drafts included, for the frontend's draft preview; needs `Authorization: Bearer <PREVIEW_SECRET>` and answers 404 when no secret is configured |
| `GET /api/__dev/posts` | Every post, drafts included; local development only (404 in production) |
| `GET /health` | `{"status": "ok", "env": "production", "commit": "<sha>"}`, uncached; `commit` is the git commit the deploy shipped, absent where `COMMIT_SHA` is unset (locally) |
| `GET /` | A greeting |

Every `/api` response is JSON in one envelope: `{"status": "success", "data": ...}` (lists add `count`) or `{"status": "error", "message": ...}`. Contract tests here and in the frontend pin these shapes exactly. One post, from `GET /api/post/1password-git-workflow` (the content cut short):

```json
{
  "status": "success",
  "data": {
    "id": 13,
    "slug": "1password-git-workflow",
    "category": "articles",
    "title": "Integrating 1Password into My Git Workflow",
    "description": "How I use 1Password ssh agent to help authenticate with GitHub and sign commits.",
    "author": "Tianwei Zhang",
    "createdAt": "2025-10-23T04:00:00.000Z",
    "updatedAt": null,
    "isPublished": true,
    "content": "\nAs a developer, I deal with git commits and git pushes on a regular basis. ..."
  }
}
```

`GET /api/posts` lists the same fields without `content` and `isPublished`. `description` and `updatedAt` may be `null`; dates are UTC instants of midnight in `America/New_York`.

<h2>Local Run</h2>

Prerequisites: **Node.js 26** (see `.nvmrc`), **pnpm 10**, and a checkout of [tianwei-io-content](https://github.com/notbd/tianwei-io-content) for the database: run `pnpm dev` there first. It builds the posts table in memory from the content files and serves it on `127.0.0.1:5431` over the protocol the neon-http driver speaks ([its ADR-0004](https://github.com/notbd/tianwei-io-content/blob/main/docs/adr/0004-in-process-local-database.md)).

```shell
git clone git@github.com:notbd/tianwei-io-api.git
cd tianwei-io-api
pnpm install
cp .dev.vars.example .dev.vars   # its DATABASE_URL already names that local database
pnpm dev                         # wrangler dev on http://127.0.0.1:8787
```

When the host in `DATABASE_URL` is `127.0.0.1` or `localhost`, queries go to that endpoint over plain HTTP (`src/db/connector.ts`). Any other host, `::1` included, must be a Neon database, since the driver cannot reach a plain Postgres. Running the whole site locally is in [the content engine's README](https://github.com/notbd/tianwei-io-content/blob/main/README.md) (Local Run).

`pnpm test` needs no database: it runs on PGlite in memory.

<h2>Configuration</h2>

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Plain variable (`wrangler.jsonc` in production, `.dev.vars` locally); `development` turns on `/api/__dev/posts` |
| `DATABASE_URL` | Worker secret (`pnpm wrangler secret put DATABASE_URL`): the Neon connection string. Locally, in `.dev.vars`: the content engine's database on `127.0.0.1:5431`, or a Neon branch |
| `PREVIEW_SECRET` (optional) | Worker secret that enables the preview endpoint; must match the frontend's. A value shorter than 16 characters only disables preview and logs why; the public endpoints keep working |
| `COMMIT_SHA` | Set by the deploy (`wrangler deploy --var COMMIT_SHA:<sha>`) and reported by `/health` as `commit`; unset locally |

`worker-configuration.d.ts` holds the Workers runtime types `src/` is checked against; regenerate it with `pnpm cf-typegen` after bumping `wrangler` or `compatibility_date`.

<h2>Quality Gates</h2>

```shell
pnpm lint
pnpm typecheck
pnpm test    # contract tests (exact JSON responses), repo tests (real SQL on PGlite), the deploy script with a fake wrangler
pnpm smoke <baseline-url> <candidate-url>
```

`pnpm smoke` compares every endpoint between two deployments, such as production and a local `wrangler dev` before a release: status codes, and bodies as JSON with key order ignored. Both sides must serve the same data, so the local `wrangler dev` needs `NODE_ENV=production` and a `DATABASE_URL` that names a Neon branch with production's data, not the local database ([`release-verification.md`](https://github.com/notbd/tianwei.io/blob/main/docs/release-verification.md), Compare with production).

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every pull request, and `node scripts/deploy.ts check`, which proves the deploy script loads and reaches wrangler without credentials.

<h2>Deploy</h2>

A push to `main` runs `.github/workflows/deploy.yml`:

1. Run lint, typecheck, tests and `node scripts/deploy.ts check` again.
2. Stop unless the commit is the head of `main`: re-running an old run would deploy old code over newer. A run that a newer push overtakes before it gets here stops; the newer run deploys.
3. `node scripts/deploy.ts release <sha>`: save the version serving all traffic (stop, with nothing deployed, unless exactly one version serves all traffic), run `wrangler deploy --var COMMIT_SHA:<sha>`, then verify within 90 s. One pass of the verification:
   - `/health` reports `<sha>`;
   - `/api/posts`, `/api/categories` and the first listed post answer 200 in a success envelope;
   - `/health` still reports `<sha>`.

   A pass that meets a network error, a 5xx or another commit on `/health` (the database may be waking up, or the new version is not serving yet) runs again from the top 3 s later, until one passes or the 90 s run out. No pass starts after the 90 s; one under way runs to its end. On the data endpoints, a 4xx, a wrong envelope or an empty list fails at once.
4. If step 3 failed or was cancelled while it ran, `node scripts/deploy.ts restore` rolls back to the saved version when a different one is live, and confirms it is live again. The job stays red. If the rollback fails, the log names the saved version and the command that restores it by hand.

wrangler runs from this repo's dependencies (`pnpm exec`), and only steps 3 and 4 get the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Deploys run one at a time. `node scripts/deploy.ts verify <url> <sha>` runs step 3's verification alone against any deployment.

The new version takes traffic before it is verified, an exception to the deploy handshake the content deploy runs against the frontend; why, and what was considered instead, is in [tianwei.io ADR-0006](https://github.com/notbd/tianwei.io/blob/main/docs/adr/0006-cross-repo-releases.md).

> **Release order**: the Worker selects every column its schema declares, so the order in which this repo and the content engine ship a schema change matters. Which repo goes first for any change that spans repos follows the rule in [tianwei.io ADR-0006](https://github.com/notbd/tianwei.io/blob/main/docs/adr/0006-cross-repo-releases.md); such a release is rehearsed first per [`release-verification.md`](https://github.com/notbd/tianwei.io/blob/main/docs/release-verification.md).

Design records are in [`docs/adr/`](./docs/adr/).

<h2>License</h2>

Source code is licensed under <a href='./LICENSE'>AGPLv3</a>.<br>
Posts (in <a href='https://github.com/notbd/tianwei-io-content'>tianwei-io-content</a>) are licensed under <a href='https://creativecommons.org/licenses/by-nc-sa/4.0/'>CC BY-NC-SA 4.0</a>.
</samp>
