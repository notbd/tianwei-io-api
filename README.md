# tianwei-io-api

```bash
pnpm install
pnpm run dev
```

```zsh
# server will use the HONO_PORT value from env (default 3000)
open http://localhost:3000
```

## Quick test: env loader + DB connector

To quickly verify your environment loader and database connector work, place a valid `.env.local` file in the repo root with `DEPLOYMENT_ENV`, `DATABASE_URL` and `HONO_PORT` (default to 3000), then run:

```bash
# with pnpm (recommended)
pnpm run test:env-db

# or with npm
npm run test:env-db
```
