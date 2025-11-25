# tianwei-io-api

```bash
pnpm install
pnpm run dev
```

```zsh
open http://localhost:3000
```

## Quick test: env loader + DB connector

To quickly verify your environment loader and database connector work, place a valid `.env.local` file in the repo root with `DEPLOYMENT_ENV` and `DATABASE_URL`, then run:

```bash
# with pnpm (recommended)
pnpm run test:env-db

# or with npm
npm run test:env-db
```
