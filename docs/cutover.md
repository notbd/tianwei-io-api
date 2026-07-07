# Cutover runbook: fly.io → Cloudflare Workers

Ordered checklist for moving `tio.twz.app` to the Worker. Rollback at any
point = re-point the DNS record back to fly (the fly app stays alive until
the final step).

## 0. Preconditions (hard dependency)

- [ ] `tianwei-io-content` PR merged **and** its deploy workflow has run
      (applies migrations `0000`–`0003` to Neon). The Worker selects
      `updated_at`; deploying it first would 500 on every DB query.
- [ ] Verify: `psql $DATABASE_URL -c "\d posts"` shows `updated_at`, or
      re-run the content deploy workflow manually (workflow_dispatch).

## 1. Secrets

- [ ] GitHub repo secrets (this repo): `CLOUDFLARE_API_TOKEN`
      (Workers Scripts:Edit permission), `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Worker secret: `pnpm wrangler secret put DATABASE_URL`
      (the production Neon connection string).
- [ ] Optional (draft preview): `pnpm wrangler secret put PREVIEW_SECRET`
      (≥16 chars) + the same value as `PREVIEW_SECRET` env var on Vercel.

## 2. First deploy (workers.dev only)

- [ ] Merge the API PR to `main` → deploy workflow runs
      (or manually: `pnpm deploy`).
- [ ] Smoke against the live fly baseline:
      `pnpm smoke https://tio.twz.app https://tianwei-io-api.<account>.workers.dev`
      — all checks must pass (the script allows `updatedAt` as a known
      additive field).

## 3. Domain switch (twz.app zone is already on Cloudflare)

- [ ] Delete the existing `tio` DNS record pointing at fly.
- [ ] Uncomment the `routes` block in `wrangler.jsonc`
      (`tio.twz.app`, custom_domain) and deploy — Cloudflare provisions
      DNS + certificate automatically.
- [ ] Re-run smoke against `https://tio.twz.app` (baseline: workers.dev URL).

## 4. Post-cutover

- [ ] Cloudflare dashboard → Security → WAF → rate limiting rule:
      e.g. 100 req/min per IP on `tio.twz.app/*`.
- [ ] End-to-end check: push a trivial content change → content CI syncs →
      frontend revalidates → page updates.
- [ ] TTFB comparison vs the baseline recorded in the API PR
      (fly cold ~1.3s / warm 85–450ms).
- [ ] Vercel: confirm `CONTENT_API_URL` still points at `https://tio.twz.app`
      (unchanged — the domain moved, not the URL).

## 5. Decommission (after 1–2 weeks of soak)

- [ ] `fly apps destroy tianwei-io-api`
- [ ] Rotate `REVALIDATION_SECRET` and the Neon password if not already done.
