# Vercel → Coolify Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host Taru Villas on the self-hosted Coolify PaaS (`morpheus-apps` VPS) at `https://tvpl.morpheusds.com`, built from `main` via a Next.js standalone Docker image, replacing Vercel.

**Architecture:** Add `output: 'standalone'` + a multi-stage `node:22-alpine` Dockerfile so Coolify builds a slim container from the GitHub `main` branch. Traefik (already on the VPS) terminates TLS via Let's Encrypt. Supabase stays external and unchanged. The OTA branch is NOT merged.

**Tech Stack:** Next.js 16.1.6, Node 22 (Alpine), Docker multi-stage build, Coolify, Traefik, Supabase (Postgres + Auth).

## Global Constraints

- Build from `main` only. **Do NOT merge `feat/ota-reviews-dashboard`.**
- Base image `node:22-alpine`; non-root runtime user; container listens on `:3000`, `HOSTNAME=0.0.0.0`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are inlined at **build time** — must be Docker `ARG`s and marked "Available at Buildtime" in Coolify.
- DB connection keeps `{ prepare: false }` (PgBouncer) — no change needed, just don't regress env vars.
- Keep Vercel live as rollback until VPS verification passes.
- No local Docker on the dev Mac → Dockerfile integration is verified by the first Coolify build; local check is `npm run build` producing `.next/standalone/server.js`.
- Domain: `tvpl.morpheusds.com`. VPS: `178.105.116.19` (SSH alias `morpheus-apps`). Repo: `github.com/MorpheusDigital/Taru-Villas`.

---

## File Structure

- **Modify** `next.config.ts` — add `output: 'standalone'`.
- **Create** `Dockerfile` — multi-stage build → runnable standalone server.
- **Create** `.dockerignore` — trim build context, prevent `.env*` leak.
- **Create** `.env.production.example` — document the Coolify env set (no secrets).

All four ship in Task 1. Tasks 2–5 are git + runbook (Coolify/DNS/Supabase) operations with no code.

---

### Task 1: Docker build configuration

**Files:**
- Modify: `next.config.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `.env.production.example`
- Verify: local `npm run build`

**Interfaces:**
- Produces: a container that runs `node server.js` on `:3000`, consuming env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build-time), and `POSTGRES_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` (runtime).

- [ ] **Step 1: Enable standalone output in `next.config.ts`**

Replace the file contents with:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.next
.git
.github
.env
.env.*
!.env.production.example
npm-debug.log*
.DS_Store
docs
*.md
.vscode
coverage
```

- [ ] **Step 3: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# ---- deps: install node_modules from lockfile ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile Next standalone output ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined at build time — must arrive as build args
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal runtime image ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache curl
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# standalone output does not include public/ or static/ — copy them explicitly
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 4: Create `.env.production.example`** (documents the Coolify env set; no secrets)

```bash
# Coolify Environment Variables for Taru Villas (production)
# Copy values from local .env.local. Mark the two NEXT_PUBLIC_* vars
# as "Available at Buildtime" in Coolify — they are inlined at build time.

# --- build-time (REQUIRED, mark Buildtime in Coolify) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# --- runtime (REQUIRED) ---
POSTGRES_URL=
DATABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_AI_TOKEN=

# --- optional (OTA feature, leave unset this round) ---
# GOOGLE_PLACES_API_KEY=
# ANTHROPIC_API_KEY=
# CRON_SECRET=

# --- do NOT set in production ---
# DEV_BYPASS_AUTH   (dev-only auth bypass)
# VERCEL_OIDC_TOKEN (Vercel-only artifact)
```

- [ ] **Step 5: Verify the standalone build locally**

Run: `npm run build`
Expected: build completes; the route table prints; no errors. Then:

Run: `test -f .next/standalone/server.js && echo "STANDALONE OK"`
Expected: prints `STANDALONE OK` (confirms `output: 'standalone'` took effect — this is the artifact the Dockerfile runs).

- [ ] **Step 6: Commit**

```bash
git add next.config.ts Dockerfile .dockerignore .env.production.example
git commit -m "feat(deploy): dockerize for Coolify (Next standalone + multi-stage build)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Land on `main` via PR (no OTA)

**Files:** none (git operations only)

**Interfaces:**
- Consumes: Task 1's commit on `chore/coolify-deploy`.
- Produces: `main` on `origin` containing the Docker config (the branch Coolify will deploy).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/coolify-deploy
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head chore/coolify-deploy \
  --title "Dockerize for Coolify hosting migration" \
  --body "$(cat <<'EOF'
Migrates hosting from Vercel to self-hosted Coolify (morpheus-apps VPS).

- Adds `output: 'standalone'`, multi-stage Dockerfile, `.dockerignore`, env example.
- Builds from `main`. Does NOT include the OTA dashboard branch.
- Spec: docs/superpowers/specs/2026-06-20-coolify-migration-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirm CI/clean diff, then merge**

Run: `gh pr view --json files,mergeable,title`
Expected: only the 4 Docker files + the 2 parked OTA-doc commits; `mergeable: MERGEABLE`. Verify no OTA source files (`src/lib/ota`, `vercel.json`) are in the diff.

```bash
gh pr merge chore/coolify-deploy --merge --delete-branch
```

- [ ] **Step 4: Sync local `main`**

```bash
git checkout main && git pull origin main && git log --oneline -3
```
Expected: the merge commit + Docker config present on `main`. `feat/ota-reviews-dashboard` untouched.

---

### Task 3: Create the Coolify application (USER-DRIVEN — exact runbook)

**Files:** none. These are dashboard actions performed by the user; the agent provides the steps verbatim and waits for confirmation at the checkpoint.

- [ ] **Step 1: Connect GitHub to Coolify**

In Coolify (`http://178.105.116.19:8000`) → **Sources** → **+ Add** → **GitHub App** → install the Coolify GitHub App on the `MorpheusDigital` org, granting access to the `Taru-Villas` repo. (If a source already exists for the org, reuse it.)

- [ ] **Step 2: Create the application**

**Projects** → pick/create a project → **+ New Resource** → **Application** → **Public/Private Repository (via GitHub App)** → select `MorpheusDigital/Taru-Villas`:
- Branch: `main`
- Build Pack: **Dockerfile**
- Dockerfile location: `/Dockerfile`
- Port: `3000`

- [ ] **Step 3: Set the domain**

Application → **Configuration → General → Domains**: `https://tvpl.morpheusds.com`
(Coolify directs Traefik to issue Let's Encrypt once DNS resolves — Task 4.)

- [ ] **Step 4: Add environment variables**

Application → **Environment Variables**. Add, with values copied from local `.env.local`:

| Var | Mark "Available at Buildtime"? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **YES** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **YES** |
| `POSTGRES_URL` | no |
| `DATABASE_URL` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | no |
| `CLOUDFLARE_ACCOUNT_ID` | no |
| `CLOUDFLARE_AI_TOKEN` | no |

Do **not** add `DEV_BYPASS_AUTH` or `VERCEL_OIDC_TOKEN`. Leave OTA keys unset.

> Agent: provide the user a `key=value` block by reading `.env.local` for these 7 keys, so they paste once. Then **STOP and wait** for the user to confirm env vars are entered before proceeding to Task 4.

---

### Task 4: DNS + Supabase configuration (USER-DRIVEN — exact runbook)

**Files:** none.

- [ ] **Step 1: Point DNS at the VPS**

In the `morpheusds.com` DNS provider, add:
- Type `A`, Name `tvpl`, Value `178.105.116.19`, TTL default.
- If the provider is Cloudflare, set the record to **DNS only** (grey cloud) so Traefik can complete the Let's Encrypt HTTP-01 challenge.

- [ ] **Step 2: Verify DNS resolves**

Agent runs: `dig +short tvpl.morpheusds.com`
Expected: `178.105.116.19`. (Propagation may take minutes; re-check until correct.)

- [ ] **Step 3: Update Supabase auth URLs**

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL** → `https://tvpl.morpheusds.com`
- **Redirect URLs** → add `https://tvpl.morpheusds.com/**` (keep `http://localhost:3000/**`).

---

### Task 5: Deploy, verify, cut over, decommission

**Files:** none (final `vercel.json` cleanup deferred until Vercel retired).

- [ ] **Step 1: Trigger the Coolify deploy**

Application → **Deploy**. Watch the build log: Docker build should complete through all stages and the container should start (`▲ Next.js` ready line). If the Alpine image fails on `sharp`/image optimization, switch the Dockerfile `base` image from `node:22-alpine` to `node:22-slim` (Debian), drop the `apk add` lines in favor of `apt-get install -y curl`, re-commit, redeploy.

- [ ] **Step 2: TLS + reachability**

Agent runs: `curl -sS -I https://tvpl.morpheusds.com`
Expected: HTTP `200`/`307` with a valid cert (no TLS error). A redirect to `/login` is expected for the root when unauthenticated.

- [ ] **Step 3: Functional verification**

In a browser at `https://tvpl.morpheusds.com`:
- Log in (email/password). Confirm session persists across a navigation (cookies forward correctly behind Traefik).
- Open a dashboard/surveys page — confirm real Supabase data renders (DB connectivity + `prepare:false` OK).
- Open DevTools console on a page using the browser Supabase client — no "supabaseUrl is required"/undefined errors (confirms the build-time `NEXT_PUBLIC_*` vars were inlined).
- Run a meter-scan on a utility reading — confirm OCR returns a value (Cloudflare token reachable).

- [ ] **Step 4: Cut over**

Once Step 3 passes, `tvpl.morpheusds.com` is authoritative. Communicate the new URL to users. (No Vercel domain DNS to repoint — the Vercel app was `*.vercel.app`.)

- [ ] **Step 5: Decommission Vercel**

After a stable observation window:
- Vercel dashboard → Taru Villas project → **Settings → Cron Jobs**: confirm/remove the failing `ota-sync` cron.
- Pause or delete the Vercel project (keep the GitHub link removed so pushes don't redeploy there).

- [ ] **Step 6: Update project docs**

Update `CLAUDE.md` Deployment section + `MEMORY.md` to record Coolify as the host (URL, VPS, Coolify app, how to deploy = push to `main`). Commit on a docs branch → PR → merge.

---

## Self-Review

**Spec coverage:**
- Architecture / standalone Dockerfile → Task 1 ✓
- Build-time NEXT_PUBLIC vars → Task 1 Step 3 + Task 3 Step 4 ✓
- Env var set (7 required, OTA/dev excluded) → Task 1 Step 4 + Task 3 Step 4 ✓
- Git: branch off main, PR, merge, no OTA → Task 2 ✓
- Coolify app + domain + SSL → Task 3 + Task 5 ✓
- DNS + Supabase auth URLs → Task 4 ✓
- Verification checklist → Task 5 Step 3 ✓
- Vercel rollback then decommission → Task 5 Steps 4–5 ✓
- Alpine→slim fallback risk → Task 5 Step 1 ✓
- Deferred (OTA merge, cron, vercel.json removal, /api/health) → spec "Deferred"; not in plan scope ✓

**Placeholder scan:** No TBD/TODO; all file contents and commands are concrete.

**Type/name consistency:** Domain `tvpl.morpheusds.com`, port `3000`, base `node:22-alpine`, branch names, and the 7-var env set are used identically across Tasks 1–5.

**No-local-Docker note:** Task 1 verifies via `npm run build`; the Dockerfile's integration test is the first Coolify build (Task 5 Step 1), which has an explicit fallback path.
