# Spec: Migrate Taru Villas hosting from Vercel → Coolify (morpheus-apps VPS)

**Date:** 2026-06-20
**Branch:** `chore/coolify-deploy` (off `main`)
**Status:** Approved design, pending implementation

## Goal

Move Taru Villas production hosting from Vercel (serverless) to the self-hosted
**Coolify** PaaS already running on the `morpheus-apps` VPS (`178.105.116.19`),
serving the app at **`https://tvpl.morpheusds.com`**. Supabase (Postgres + Auth)
is external and does **not** move.

Secondary goal ("get the repo updated to latest"): land the deployment changes on
`main` and bring `main` current on `origin`, **without** merging the in-progress
OTA work.

## Explicit non-goals / constraints

- **Do NOT merge `feat/ota-reviews-dashboard`.** The OTA dashboard is incomplete
  and stays a parked branch. The Coolify deployment is built from `main`, which
  contains **no OTA code** (only two doc-only commits: the OTA spec + plan markdown).
- **Accepted consequence:** the current Vercel site shows the OTA tab (the branch
  was direct-uploaded via Vercel CLI). The new Coolify site, built from `main`,
  will **not** show OTA. Maia's demo data persists in Supabase; it simply has no UI
  until the OTA branch is finished and merged later, at which point Coolify
  auto-deploys it.
- OTA API keys (`GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`) remain unset — out of
  scope. No cron is migrated this round (the OTA cron is branch-only; `main` has no
  scheduled jobs).
- Keep Vercel live as rollback until the VPS deployment is verified.

## Discovered environment (read-only inspection, 2026-06-20)

- VPS `morpheus-apps` = `178.105.116.19`, Ubuntu 24.04.4 LTS, SSH user `sonal`
  (in sudo group; sudo needs password).
- **Coolify** confirmed: `/data/coolify` present; dashboard on `:8000`
  (Traefik on 80/443, realtime on 6001/6002). Docker CE 29.5 + compose plugin.
- GitHub remote: `https://github.com/MorpheusDigital/Taru-Villas.git`.
- App is stock Next.js 16.1.6 (`next build` / `next start`); no custom `next.config`.
- Env vars the **code actually reads** (`grep process.env` over `src/`): 11 total —
  see the env table below. (The many extra `POSTGRES_*`/`SUPABASE_*` vars in
  `.env.local` are Vercel↔Supabase integration artifacts and are unused.)

## Architecture

```
GitHub (MorpheusDigital/Taru-Villas)
        │  push main  →  Coolify GitHub App webhook
        ▼
Coolify (178.105.116.19) builds Dockerfile (Next standalone)
        ▼
Docker container: node:22-alpine, `node server.js`, listens :3000
        ▼
Traefik :443  ──Let's Encrypt──▶  https://tvpl.morpheusds.com
        ▼
Supabase (external, UNCHANGED): Postgres (PgBouncer :6543) + Auth
```

One Coolify **Application** resource, source = GitHub repo `main` branch, build pack
= Dockerfile. No database resource in Coolify (Supabase stays external).

## Code changes (committed to `chore/coolify-deploy`)

### 1. `next.config.ts`
Add `output: 'standalone'` so `next build` emits `.next/standalone` (minimal
server + pruned `node_modules`), keeping the image small.

### 2. `Dockerfile` (new) — multi-stage

- **deps** stage: `node:22-alpine`, `apk add libc6-compat`, `npm ci`.
- **builder** stage: copy source, accept build args, `npm run build`.
- **runner** stage: `node:22-alpine`, non-root `nextjs` user, `apk add curl`
  (for future cron task + healthcheck), copy `.next/standalone`, `.next/static`,
  `public`; `ENV PORT=3000 HOSTNAME=0.0.0.0`; `CMD ["node","server.js"]`.

**Critical build-time gotcha:** `NEXT_PUBLIC_*` vars are inlined into the client
bundle at **build time**, not runtime. The Dockerfile must declare them as `ARG`s
promoted to `ENV` in the builder stage:

```dockerfile
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
```

In Coolify these two vars must be marked **"Available at Buildtime"**. If missed,
server-side works but the browser Supabase client is built with `undefined` URL/key.

### 3. `.dockerignore` (new)
Exclude `node_modules`, `.next`, `.git`, `.env*`, `docs`, `drizzle` build noise,
local caches — shrinks build context and prevents leaking `.env.local`.

### Risk / fallback
If the Alpine image fails on Next's image optimizer (`sharp`) at build or runtime,
switch the base image to `node:22-slim` (Debian). Decision made at build time only
if it actually breaks.

## Environment variables (set in Coolify)

| Var | Required? | Build-time? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | **yes** | mark "Available at Buildtime" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | **yes** | mark "Available at Buildtime" |
| `POSTGRES_URL` | yes | no | primary DB (PgBouncer `:6543`, `prepare:false`) |
| `DATABASE_URL` | yes | no | fallback for `POSTGRES_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | no | service-role server client |
| `CLOUDFLARE_ACCOUNT_ID` | yes | no | meter-scan OCR |
| `CLOUDFLARE_AI_TOKEN` | yes | no | meter-scan OCR |
| `GOOGLE_PLACES_API_KEY` | optional | no | OTA only — leave unset |
| `ANTHROPIC_API_KEY` | optional | no | OTA only — leave unset |
| `CRON_SECRET` | optional | no | OTA cron only — leave unset this round |
| `DEV_BYPASS_AUTH` | **do not set** | — | dev-only auth bypass |
| `VERCEL_OIDC_TOKEN` | **do not set** | — | Vercel-only artifact |

Values are copied from local `.env.local` (Supabase project unchanged).

## External configuration (user performs, with exact steps provided)

1. **DNS:** A record `tvpl.morpheusds.com → 178.105.116.19` (proxy off / DNS-only
   if Cloudflare, so Traefik can issue Let's Encrypt).
2. **Supabase → Authentication → URL Configuration:**
   - Site URL → `https://tvpl.morpheusds.com`
   - Redirect allow-list → add `https://tvpl.morpheusds.com/**` (keep
     `http://localhost:3000/**` for dev).
3. **Coolify dashboard:**
   - Connect GitHub via Coolify's GitHub App (private repo access).
   - New Application → repo `MorpheusDigital/Taru-Villas`, branch `main`, build
     pack = Dockerfile.
   - Set domain `https://tvpl.morpheusds.com` (Traefik auto-issues SSL).
   - Paste env vars; mark the two `NEXT_PUBLIC_*` as build-time.
   - Deploy.

## Execution order

1. **Code + git:** commit Docker changes to `chore/coolify-deploy`; push; open PR;
   merge to `main`; push `main` (also lands the 2 parked OTA-doc commits). OTA
   branch untouched.
2. **Coolify:** create app from `main`, env + domain, deploy.
3. **DNS + Supabase** config.
4. **Verify** (see below).
5. **Cut over & decommission Vercel** only after verification passes.

## Verification checklist

- `https://tvpl.morpheusds.com` serves with valid Let's Encrypt cert.
- Login works (email/password); session persists across navigation (cookies behind
  Traefik forward correctly).
- A dashboard route renders real Supabase data (DB connectivity + `prepare:false`).
- Browser Supabase client initialized (no `undefined` URL/key → confirms build-time
  vars took).
- Meter-scan OCR works on a property reading (Cloudflare token reachable).
- Coolify deploy log shows a clean Docker build; container healthy.

## Rollback

Vercel stays live and authoritative until verification passes. If Coolify fails,
no DNS for the Vercel domain changes — simply don't cut over. Decommission Vercel
(and later delete `vercel.json` in a cleanup commit) only after the VPS is verified.

## Deferred (not this round)

- OTA dashboard finish + merge → Coolify auto-deploys it; then add OTA env keys and
  a **Coolify Scheduled Task** (`0 3 * * *`) running
  `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/ota-sync`.
- Optional `/api/health` route for a tighter Coolify healthcheck (root path works
  for now).
- Remove `vercel.json` once Vercel is fully retired.
