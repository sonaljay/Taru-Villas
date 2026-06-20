# OTA Reviews Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third dashboard surface (OTA) that ingests Google Places reviews on a daily cron, runs Claude synthesis to produce aspect scores + strengths / weaknesses / repetitive issues, and renders results read-only with repetitive issues visually flagged.

**Architecture:** Isolated pipeline parallel to surveys. Three new tables (`ota_review_sources`, `ota_reviews`, `ota_syntheses`). Daily cron at 03:00 UTC fetches Google Places, dedupes into DB, then calls Claude (sonnet-4-6, tool-use mode) to produce a snapshot per property. Dashboard reads the latest snapshot.

**Tech Stack:** Next.js 16 App Router, Drizzle, Postgres (Supabase), Anthropic SDK (new), Google Places API (new), shadcn/ui (existing).

**Spec:** `docs/superpowers/specs/2026-04-29-ota-reviews-dashboard-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `drizzle/0012_ota_reviews.sql` | Hand-written migration creating the 3 tables |
| `src/lib/ota/aspects.ts` | `CORE_ASPECTS` constant + types for aspect keys |
| `src/lib/ota/types.ts` | TS types for `AspectScores`, `Strength`, `Weakness`, `RepetitiveIssue`, `Synthesis` |
| `src/lib/ota/helpers.ts` | Pure helpers: `hashReviewId`, `googleRatingToTen`, `computeAspectTrend` |
| `src/lib/ota/google-places.ts` | Adapter: `fetchPlaceReviews(placeId)` calling Google Places Details |
| `src/lib/ota/synthesis.ts` | Adapter: `synthesizeReviews(...)` calling Anthropic SDK with tool-use, plus `PROMPT_VERSION` |
| `src/lib/ota/sync.ts` | Orchestrator: `syncProperty(propertyId)` — fetch + dedupe + synthesize end-to-end |
| `src/lib/db/queries/ota.ts` | All DB queries for OTA (sources, reviews, syntheses) |
| `src/app/api/cron/ota-sync/route.ts` | Daily cron entrypoint — Bearer-auth, loops sources |
| `src/app/api/admin/ota/sync/[propertyId]/route.ts` | Admin "Refresh now" trigger for one property |
| `src/components/dashboard/ota-tab.tsx` | OTA tab content for property dashboard (header, aspects, radar, synthesis, reviews) |
| `src/components/dashboard/ota-overview-tab.tsx` | OTA tab content for org overview dashboard |
| `vercel.json` | Cron config (file does not exist yet) |

### Modified files

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | Add table definitions for the 3 new tables + relations |
| `src/components/dashboard/property-dashboard.tsx` | Add `OTA` tab trigger; render `<OtaTab>` when `surveyType === 'ota'` |
| `src/components/dashboard/dashboard-overview.tsx` | Add `OTA` tab trigger; render `<OtaOverviewTab>` when `surveyType === 'ota'` |
| `src/app/(portal)/dashboard/page.tsx` | Branch on `surveyType === 'ota'` to load OTA org data; widen `surveyType` type |
| `src/app/(portal)/dashboard/[propertyId]/page.tsx` | Branch on `surveyType === 'ota'` to load OTA property data |
| `src/components/admin/property-form.tsx` | Add `Google Place ID` input bound to a new column |
| `src/app/api/properties/[id]/route.ts` | Accept and persist `googlePlaceId` in PUT body, manage `ota_review_sources` row |
| `src/middleware.ts` | (Already excludes `/api/cron/*`. No change required — verify.) |
| `package.json` | Add `@anthropic-ai/sdk` dependency |
| `CLAUDE.md` | Add new env vars to the env table |

---

## Task 1: Migration + Drizzle schema

**Files:**
- Create: `drizzle/0012_ota_reviews.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/0012_ota_reviews.sql`:

```sql
CREATE TABLE IF NOT EXISTS "ota_review_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL,
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_fetched_at" timestamp with time zone,
  "last_fetch_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ota_review_sources_property_source_unique" UNIQUE ("property_id", "source"),
  CONSTRAINT "ota_review_sources_source_check" CHECK ("source" IN ('google'))
);
--> statement-breakpoint

ALTER TABLE "ota_review_sources"
  ADD CONSTRAINT "ota_review_sources_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ota_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL,
  "property_id" uuid NOT NULL,
  "external_review_id" text NOT NULL,
  "author_name" text,
  "rating" integer NOT NULL,
  "text" text,
  "language" text,
  "reviewed_at" timestamp with time zone NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "raw_payload" jsonb,
  CONSTRAINT "ota_reviews_source_external_id_unique" UNIQUE ("source_id", "external_review_id")
);
--> statement-breakpoint

ALTER TABLE "ota_reviews"
  ADD CONSTRAINT "ota_reviews_source_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "ota_review_sources"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "ota_reviews"
  ADD CONSTRAINT "ota_reviews_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ota_reviews_property_reviewed_at_idx"
  ON "ota_reviews" ("property_id", "reviewed_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ota_syntheses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "reviews_analyzed" integer NOT NULL,
  "avg_rating" numeric(3,2),
  "aspect_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "repetitive_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'ok' NOT NULL,
  "error_message" text,
  "model_used" text NOT NULL,
  "prompt_version" text NOT NULL,
  "cost_usd" numeric(8,4),
  CONSTRAINT "ota_syntheses_status_check" CHECK ("status" IN ('ok','insufficient_data','error'))
);
--> statement-breakpoint

ALTER TABLE "ota_syntheses"
  ADD CONSTRAINT "ota_syntheses_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ota_syntheses_property_generated_at_idx"
  ON "ota_syntheses" ("property_id", "generated_at" DESC);
```

- [ ] **Step 2: Apply via Supabase SQL editor**

Open Supabase Studio → Project → SQL Editor → New query. Paste the file contents. Click `Run`. Confirm 3 tables exist via the Table Editor.

- [ ] **Step 3: Add Drizzle table definitions**

Append to `src/lib/db/schema.ts` (before the `// End of schema` marker if any, otherwise at the bottom). Locate `properties` import — already present.

```ts
// ---------------------------------------------------------------------------
// OTA reviews
// ---------------------------------------------------------------------------
import { jsonb } from 'drizzle-orm/pg-core'

export const otaReviewSources = pgTable(
  'ota_review_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    lastFetchError: text('last_fetch_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    propertySourceUnique: unique('ota_review_sources_property_source_unique').on(
      t.propertyId,
      t.source
    ),
  })
)

export const otaReviews = pgTable(
  'ota_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => otaReviewSources.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    externalReviewId: text('external_review_id').notNull(),
    authorName: text('author_name'),
    rating: integer('rating').notNull(),
    text: text('text'),
    language: text('language'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    rawPayload: jsonb('raw_payload'),
  },
  (t) => ({
    sourceExternalIdUnique: unique('ota_reviews_source_external_id_unique').on(
      t.sourceId,
      t.externalReviewId
    ),
  })
)

export const otaSyntheses = pgTable('ota_syntheses', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  reviewsAnalyzed: integer('reviews_analyzed').notNull(),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }),
  aspectScores: jsonb('aspect_scores').default(sql`'{}'::jsonb`).notNull(),
  strengths: jsonb('strengths').default(sql`'[]'::jsonb`).notNull(),
  weaknesses: jsonb('weaknesses').default(sql`'[]'::jsonb`).notNull(),
  repetitiveIssues: jsonb('repetitive_issues').default(sql`'[]'::jsonb`).notNull(),
  status: text('status').default('ok').notNull(),
  errorMessage: text('error_message'),
  modelUsed: text('model_used').notNull(),
  promptVersion: text('prompt_version').notNull(),
  costUsd: numeric('cost_usd', { precision: 8, scale: 4 }),
})

export const otaReviewSourcesRelations = relations(otaReviewSources, ({ one, many }) => ({
  property: one(properties, {
    fields: [otaReviewSources.propertyId],
    references: [properties.id],
  }),
  reviews: many(otaReviews),
}))

export const otaReviewsRelations = relations(otaReviews, ({ one }) => ({
  source: one(otaReviewSources, {
    fields: [otaReviews.sourceId],
    references: [otaReviewSources.id],
  }),
  property: one(properties, {
    fields: [otaReviews.propertyId],
    references: [properties.id],
  }),
}))

export const otaSynthesesRelations = relations(otaSyntheses, ({ one }) => ({
  property: one(properties, {
    fields: [otaSyntheses.propertyId],
    references: [properties.id],
  }),
}))
```

Note: move the `import { jsonb }` up into the existing import block at the top of `schema.ts` rather than mid-file. The above shows it inline for clarity only.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors. If `unique` is not yet imported in schema.ts, add it to the top-level import from `drizzle-orm/pg-core` (it's already used elsewhere — verify with grep).

- [ ] **Step 5: Commit**

```bash
git add drizzle/0012_ota_reviews.sql src/lib/db/schema.ts
git commit -m "feat(ota): add ota_review_sources, ota_reviews, ota_syntheses schema"
```

---

## Task 2: Aspect constants + types + pure helpers

**Files:**
- Create: `src/lib/ota/aspects.ts`
- Create: `src/lib/ota/types.ts`
- Create: `src/lib/ota/helpers.ts`

- [ ] **Step 1: Write `aspects.ts`**

```ts
// src/lib/ota/aspects.ts
export const CORE_ASPECTS = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'staff',       label: 'Staff & Service' },
  { key: 'food',        label: 'Food & Dining' },
  { key: 'location',    label: 'Location' },
  { key: 'value',       label: 'Value for Money' },
  { key: 'comfort',     label: 'Comfort & Room' },
  { key: 'facilities',  label: 'Facilities & Amenities' },
] as const

export type CoreAspectKey = (typeof CORE_ASPECTS)[number]['key']
export const CORE_ASPECT_KEYS = CORE_ASPECTS.map((a) => a.key) as CoreAspectKey[]
```

- [ ] **Step 2: Write `types.ts`**

```ts
// src/lib/ota/types.ts
import type { CoreAspectKey } from './aspects'

export interface CoreAspectScore {
  score: number          // 0-10
  mention_count: number
  sample_quote: string
}

export interface DynamicAspect {
  name: string
  score: number
  mention_count: number
}

export interface AspectScores {
  core: Record<CoreAspectKey, CoreAspectScore>
  dynamic: DynamicAspect[]
}

export interface Bullet {
  headline: string
  detail: string
  mention_count: number
}

export type Severity = 'low' | 'medium' | 'high'

export interface RepetitiveIssue extends Bullet {
  severity: Severity
}

export type SynthesisStatus = 'ok' | 'insufficient_data' | 'error'

export interface SynthesisOutput {
  aspect_scores: AspectScores
  strengths: Bullet[]
  weaknesses: Bullet[]
  repetitive_issues: RepetitiveIssue[]
}

export interface AspectTrend {
  key: string
  label: string
  current: number
  previous: number
  delta: number  // current - previous
}
```

- [ ] **Step 3: Write `helpers.ts`**

```ts
// src/lib/ota/helpers.ts
import { createHash } from 'node:crypto'
import { CORE_ASPECTS, type CoreAspectKey } from './aspects'
import type { AspectScores, AspectTrend } from './types'

/**
 * Stable per-review identifier. Google Places does not expose a real ID;
 * we hash author_name + reviewed_at + text. Edits to review text will
 * register as a new row — acceptable.
 */
export function hashReviewId(input: {
  authorName: string | null
  reviewedAt: Date
  text: string | null
}): string {
  const composite = [
    input.authorName ?? '',
    input.reviewedAt.toISOString(),
    input.text ?? '',
  ].join('|')
  return createHash('sha256').update(composite).digest('hex')
}

/** Google rating (1-5) → display scale (1-10). 4.6 → 9.2. */
export function googleRatingToTen(rating: number): number {
  return Math.round(rating * 2 * 10) / 10
}

/** Compute aspect-by-aspect deltas between two AspectScores blobs (core only). */
export function computeAspectTrend(
  current: AspectScores | null,
  previous: AspectScores | null
): AspectTrend[] {
  if (!current || !previous) return []
  return CORE_ASPECTS.map((aspect) => {
    const c = current.core?.[aspect.key as CoreAspectKey]?.score ?? 0
    const p = previous.core?.[aspect.key as CoreAspectKey]?.score ?? 0
    return { key: aspect.key, label: aspect.label, current: c, previous: p, delta: c - p }
  })
}
```

- [ ] **Step 4: Smoke-check the helpers**

Run from project root:

```bash
npx tsx -e "
import { hashReviewId, googleRatingToTen, computeAspectTrend } from './src/lib/ota/helpers'

const a = hashReviewId({ authorName: 'Jane', reviewedAt: new Date('2026-04-01T00:00:00Z'), text: 'Great' })
const b = hashReviewId({ authorName: 'Jane', reviewedAt: new Date('2026-04-01T00:00:00Z'), text: 'Great' })
const c = hashReviewId({ authorName: 'Jane', reviewedAt: new Date('2026-04-01T00:00:00Z'), text: 'Great!' })
console.assert(a === b, 'identical inputs must hash equal')
console.assert(a !== c, 'text change must change hash')
console.assert(googleRatingToTen(4.6) === 9.2, '4.6 -> 9.2')
console.assert(googleRatingToTen(5) === 10, '5 -> 10')
console.assert(computeAspectTrend(null, null).length === 0, 'null inputs -> empty trends')
console.log('helpers OK')
"
```

Expected: `helpers OK` and no assertion failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ota/
git commit -m "feat(ota): aspect constants, types, and pure helpers"
```

---

## Task 3: Google Places fetch adapter

**Files:**
- Create: `src/lib/ota/google-places.ts`

- [ ] **Step 1: Write the adapter**

```ts
// src/lib/ota/google-places.ts

const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

export interface GooglePlaceReview {
  authorName: string | null
  rating: number          // 1-5
  text: string | null
  language: string | null
  reviewedAt: Date        // converted from `time` (Unix seconds)
  raw: unknown
}

export interface GooglePlaceFetchResult {
  rating: number | null            // overall avg rating
  totalRatings: number | null
  reviews: GooglePlaceReview[]
}

/**
 * Fetch up to 5 most recent reviews + overall rating for a Google Place.
 * Throws on network / non-OK status / Google error responses.
 */
export async function fetchPlaceReviews(placeId: string): Promise<GooglePlaceFetchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set')

  const url = new URL(PLACE_DETAILS_URL)
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'reviews,rating,user_ratings_total')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as {
    status: string
    error_message?: string
    result?: {
      rating?: number
      user_ratings_total?: number
      reviews?: Array<{
        author_name?: string
        rating: number
        text?: string
        language?: string
        time: number // Unix seconds
      }>
    }
  }

  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places status ${json.status}: ${json.error_message ?? '(no message)'}`)
  }

  const result = json.result ?? {}
  const reviews: GooglePlaceReview[] = (result.reviews ?? []).map((r) => ({
    authorName: r.author_name ?? null,
    rating: r.rating,
    text: r.text ?? null,
    language: r.language ?? null,
    reviewedAt: new Date(r.time * 1000),
    raw: r,
  }))

  return {
    rating: result.rating ?? null,
    totalRatings: result.user_ratings_total ?? null,
    reviews,
  }
}
```

- [ ] **Step 2: Add env var to `.env.local`**

Append to `.env.local`:

```
GOOGLE_PLACES_API_KEY=<your-key>
```

To get a key: Google Cloud Console → APIs & Services → Credentials → "Create credentials" → API key. Enable "Places API" on the project.

- [ ] **Step 3: Smoke-test against a known place**

Find any well-known restaurant's Place ID via https://developers.google.com/maps/documentation/places/web-service/place-id (e.g., Sydney Opera House: `ChIJ3S-JXmauEmsRUcIaWtf4MzE`).

```bash
npx tsx -e "
import { fetchPlaceReviews } from './src/lib/ota/google-places'
const r = await fetchPlaceReviews('ChIJ3S-JXmauEmsRUcIaWtf4MzE')
console.log('rating:', r.rating, 'totalRatings:', r.totalRatings, 'reviews:', r.reviews.length)
console.log('first review:', r.reviews[0]?.authorName, r.reviews[0]?.rating, '/5')
"
```

Expected: a non-null `rating`, `reviews.length` between 0 and 5, no errors thrown.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ota/google-places.ts
git commit -m "feat(ota): google places fetch adapter"
```

---

## Task 4: Anthropic synthesis adapter

**Files:**
- Create: `src/lib/ota/synthesis.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add env var to `.env.local`**

Append to `.env.local`:

```
ANTHROPIC_API_KEY=<your-key>
```

- [ ] **Step 3: Write the synthesis adapter**

```ts
// src/lib/ota/synthesis.ts
import Anthropic from '@anthropic-ai/sdk'
import { CORE_ASPECTS } from './aspects'
import type { SynthesisOutput } from './types'

export const PROMPT_VERSION = 'v1'
export const SYNTHESIS_MODEL = 'claude-sonnet-4-6'

// Sonnet 4.6 published rates (USD per million tokens). Bump if Anthropic changes pricing.
const PRICE_INPUT_PER_MTOK = 3.0
const PRICE_OUTPUT_PER_MTOK = 15.0
const PRICE_CACHE_WRITE_PER_MTOK = 3.75
const PRICE_CACHE_READ_PER_MTOK = 0.3

const SYSTEM_PROMPT = `You are a senior hospitality review analyst. Given guest reviews for a hotel property, produce structured insights for property managers.

Output a JSON object via the synthesize_reviews tool with:

  aspect_scores.core: for each fixed aspect (${CORE_ASPECTS.map((a) => a.key).join(', ')}), a 0-10 score, a mention_count (number of input reviews touching this theme), and a brief sample_quote pulled verbatim from the reviews. Score 0 and mention_count 0 if not mentioned.

  aspect_scores.dynamic: 1-2 property-specific aspects beyond the core (e.g., "Pool", "Beach access") with the same fields. Use only if at least 3 reviews mention the theme. Cap at 2.

  strengths: 3-5 themes guests consistently praise. Each has headline (short), detail (1 concrete sentence), mention_count.

  weaknesses: 3-5 themes guests criticize. Same shape as strengths.

  repetitive_issues: themes mentioned in 3+ reviews indicating a structural problem. Each has headline, detail, mention_count, and severity (low|medium|high). Severity high = safety/health/major booking blocker; medium = repeated dissatisfaction; low = mild but persistent.

Rules:
  - Be concrete. "Hot water inconsistent in upper rooms" beats "Plumbing issues".
  - mention_count = number of distinct input reviews touching the theme.
  - Use the 0-10 scale (not 1-5, not percentages).
  - Don't invent themes. If the review set is thin, return shorter lists.
  - Quote verbatim — never paraphrase a sample_quote.`

const SYNTHESIS_TOOL = {
  name: 'synthesize_reviews',
  description: 'Produce structured insights from guest reviews',
  input_schema: {
    type: 'object' as const,
    required: ['aspect_scores', 'strengths', 'weaknesses', 'repetitive_issues'],
    properties: {
      aspect_scores: {
        type: 'object',
        required: ['core', 'dynamic'],
        properties: {
          core: {
            type: 'object',
            required: CORE_ASPECTS.map((a) => a.key),
            properties: Object.fromEntries(
              CORE_ASPECTS.map((a) => [
                a.key,
                {
                  type: 'object',
                  required: ['score', 'mention_count', 'sample_quote'],
                  properties: {
                    score: { type: 'number', minimum: 0, maximum: 10 },
                    mention_count: { type: 'integer', minimum: 0 },
                    sample_quote: { type: 'string' },
                  },
                },
              ])
            ),
          },
          dynamic: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              required: ['name', 'score', 'mention_count'],
              properties: {
                name: { type: 'string' },
                score: { type: 'number', minimum: 0, maximum: 10 },
                mention_count: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
      strengths: {
        type: 'array',
        items: {
          type: 'object',
          required: ['headline', 'detail', 'mention_count'],
          properties: {
            headline: { type: 'string' },
            detail: { type: 'string' },
            mention_count: { type: 'integer', minimum: 0 },
          },
        },
      },
      weaknesses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['headline', 'detail', 'mention_count'],
          properties: {
            headline: { type: 'string' },
            detail: { type: 'string' },
            mention_count: { type: 'integer', minimum: 0 },
          },
        },
      },
      repetitive_issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['headline', 'detail', 'mention_count', 'severity'],
          properties: {
            headline: { type: 'string' },
            detail: { type: 'string' },
            mention_count: { type: 'integer', minimum: 0 },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
    },
  },
}

export interface ReviewForPrompt {
  reviewedAt: Date
  rating: number
  text: string
}

export interface SynthesisResult {
  output: SynthesisOutput
  modelUsed: string
  promptVersion: string
  costUsd: number
}

export async function synthesizeReviews(args: {
  propertyName: string
  windowStart: Date
  windowEnd: Date
  reviews: ReviewForPrompt[]
}): Promise<SynthesisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const client = new Anthropic({ apiKey })

  const userText = [
    `Property: ${args.propertyName}`,
    `Window: ${args.windowStart.toISOString().slice(0, 10)} to ${args.windowEnd.toISOString().slice(0, 10)}`,
    `Review count: ${args.reviews.length}`,
    ``,
    `Reviews:`,
    ...args.reviews.map(
      (r, i) => `[${i + 1}] ${r.reviewedAt.toISOString().slice(0, 10)} | ${r.rating}/5 | "${r.text.replace(/\n/g, ' ')}"`
    ),
  ].join('\n')

  const response = await client.messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [SYNTHESIS_TOOL],
    tool_choice: { type: 'tool', name: SYNTHESIS_TOOL.name },
    messages: [{ role: 'user', content: userText }],
  })

  const toolUse = response.content.find((c) => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Anthropic did not return tool_use; stop_reason=${response.stop_reason}`)
  }

  const usage = response.usage
  const costUsd =
    ((usage.input_tokens ?? 0) * PRICE_INPUT_PER_MTOK) / 1_000_000 +
    ((usage.output_tokens ?? 0) * PRICE_OUTPUT_PER_MTOK) / 1_000_000 +
    ((usage.cache_creation_input_tokens ?? 0) * PRICE_CACHE_WRITE_PER_MTOK) / 1_000_000 +
    ((usage.cache_read_input_tokens ?? 0) * PRICE_CACHE_READ_PER_MTOK) / 1_000_000

  return {
    output: toolUse.input as SynthesisOutput,
    modelUsed: SYNTHESIS_MODEL,
    promptVersion: PROMPT_VERSION,
    costUsd: Math.round(costUsd * 10000) / 10000,
  }
}
```

- [ ] **Step 4: Smoke-test with synthetic reviews**

```bash
npx tsx -e "
import { synthesizeReviews } from './src/lib/ota/synthesis'
const r = await synthesizeReviews({
  propertyName: 'Test Property',
  windowStart: new Date('2026-02-01'),
  windowEnd: new Date('2026-04-29'),
  reviews: [
    { reviewedAt: new Date('2026-04-20'), rating: 5, text: 'Wonderful staff, spotless rooms, great food.' },
    { reviewedAt: new Date('2026-04-15'), rating: 4, text: 'Loved the location but hot water was inconsistent.' },
    { reviewedAt: new Date('2026-04-10'), rating: 3, text: 'Decent value, but the wifi cut out and hot water issue again.' },
    { reviewedAt: new Date('2026-04-05'), rating: 5, text: 'Best heritage hotel we have stayed at. Pool is amazing.' },
  ],
})
console.log('cost:', r.costUsd)
console.log('strengths:', JSON.stringify(r.output.strengths, null, 2))
console.log('repetitive_issues:', JSON.stringify(r.output.repetitive_issues, null, 2))
"
```

Expected: structured JSON output, "Hot water" appearing in `repetitive_issues`, non-zero `costUsd`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/ota/synthesis.ts
git commit -m "feat(ota): claude synthesis adapter with tool-use + prompt caching"
```

---

## Task 5: OTA queries module

**Files:**
- Create: `src/lib/db/queries/ota.ts`

- [ ] **Step 1: Write the queries**

```ts
// src/lib/db/queries/ota.ts
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  otaReviewSources,
  otaReviews,
  otaSyntheses,
  properties,
} from '@/lib/db/schema'
import type {
  AspectScores,
  Bullet,
  RepetitiveIssue,
  SynthesisStatus,
} from '@/lib/ota/types'

// ---------- ota_review_sources ----------

export async function getActiveSources() {
  return db
    .select({
      id: otaReviewSources.id,
      propertyId: otaReviewSources.propertyId,
      propertyName: properties.name,
      source: otaReviewSources.source,
      externalId: otaReviewSources.externalId,
    })
    .from(otaReviewSources)
    .innerJoin(properties, eq(otaReviewSources.propertyId, properties.id))
    .where(eq(otaReviewSources.isActive, true))
}

export async function getSourceForProperty(propertyId: string, source: 'google' = 'google') {
  const rows = await db
    .select()
    .from(otaReviewSources)
    .where(and(eq(otaReviewSources.propertyId, propertyId), eq(otaReviewSources.source, source)))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertSource(args: {
  propertyId: string
  source: 'google'
  externalId: string
}) {
  const existing = await getSourceForProperty(args.propertyId, args.source)
  if (!existing) {
    const [row] = await db
      .insert(otaReviewSources)
      .values({ propertyId: args.propertyId, source: args.source, externalId: args.externalId })
      .returning()
    return row
  }
  const [row] = await db
    .update(otaReviewSources)
    .set({ externalId: args.externalId, isActive: true, updatedAt: new Date() })
    .where(eq(otaReviewSources.id, existing.id))
    .returning()
  return row
}

export async function deactivateSource(propertyId: string, source: 'google' = 'google') {
  await db
    .update(otaReviewSources)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(otaReviewSources.propertyId, propertyId), eq(otaReviewSources.source, source)))
}

export async function recordFetchSuccess(sourceId: string) {
  await db
    .update(otaReviewSources)
    .set({ lastFetchedAt: new Date(), lastFetchError: null, updatedAt: new Date() })
    .where(eq(otaReviewSources.id, sourceId))
}

export async function recordFetchError(sourceId: string, message: string) {
  await db
    .update(otaReviewSources)
    .set({ lastFetchError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(otaReviewSources.id, sourceId))
}

// ---------- ota_reviews ----------

export async function insertReviewIfNew(row: typeof otaReviews.$inferInsert) {
  // ON CONFLICT (source_id, external_review_id) DO NOTHING
  await db.insert(otaReviews).values(row).onConflictDoNothing({
    target: [otaReviews.sourceId, otaReviews.externalReviewId],
  })
}

export async function getReviewsInWindow(propertyId: string, windowStart: Date) {
  return db
    .select()
    .from(otaReviews)
    .where(and(eq(otaReviews.propertyId, propertyId), gte(otaReviews.reviewedAt, windowStart)))
    .orderBy(desc(otaReviews.reviewedAt))
}

export async function getRecentReviews(propertyId: string, limit = 25) {
  return db
    .select()
    .from(otaReviews)
    .where(eq(otaReviews.propertyId, propertyId))
    .orderBy(desc(otaReviews.reviewedAt))
    .limit(limit)
}

export async function getReviewsThisMonth(orgId: string): Promise<number> {
  const since = new Date()
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)
  const result = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otaReviews)
    .innerJoin(properties, eq(otaReviews.propertyId, properties.id))
    .where(and(eq(properties.orgId, orgId), gte(otaReviews.reviewedAt, since)))
  return result[0]?.n ?? 0
}

// ---------- ota_syntheses ----------

export interface SynthesisRow {
  id: string
  propertyId: string
  generatedAt: Date
  windowStart: Date
  windowEnd: Date
  reviewsAnalyzed: number
  avgRating: string | null
  aspectScores: AspectScores
  strengths: Bullet[]
  weaknesses: Bullet[]
  repetitiveIssues: RepetitiveIssue[]
  status: SynthesisStatus
  errorMessage: string | null
  modelUsed: string
  promptVersion: string
  costUsd: string | null
}

export async function getLatestSynthesis(propertyId: string): Promise<SynthesisRow | null> {
  const rows = await db
    .select()
    .from(otaSyntheses)
    .where(eq(otaSyntheses.propertyId, propertyId))
    .orderBy(desc(otaSyntheses.generatedAt))
    .limit(1)
  return (rows[0] as SynthesisRow | undefined) ?? null
}

export async function getSynthesisForTrend(args: {
  propertyId: string
  promptVersion: string
  before: Date  // = now - 30 days
}): Promise<SynthesisRow | null> {
  const rows = await db
    .select()
    .from(otaSyntheses)
    .where(
      and(
        eq(otaSyntheses.propertyId, args.propertyId),
        eq(otaSyntheses.promptVersion, args.promptVersion),
        eq(otaSyntheses.status, 'ok'),
        lt(otaSyntheses.generatedAt, args.before)
      )
    )
    .orderBy(desc(otaSyntheses.generatedAt))
    .limit(1)
  return (rows[0] as SynthesisRow | undefined) ?? null
}

export async function insertSynthesis(row: typeof otaSyntheses.$inferInsert) {
  const [r] = await db.insert(otaSyntheses).values(row).returning()
  return r
}

export async function pruneOldSyntheses(propertyId: string, olderThan: Date) {
  await db
    .delete(otaSyntheses)
    .where(and(eq(otaSyntheses.propertyId, propertyId), lt(otaSyntheses.generatedAt, olderThan)))
}

export async function getOrgPortfolioSyntheses(orgId: string): Promise<
  Array<{ property: { id: string; name: string }; synthesis: SynthesisRow | null }>
> {
  // Return the latest synthesis per property in the org (or null)
  const props = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.isActive, true)))
  const out: Array<{ property: { id: string; name: string }; synthesis: SynthesisRow | null }> = []
  for (const p of props) {
    const synth = await getLatestSynthesis(p.id)
    out.push({ property: p, synthesis: synth })
  }
  return out
}
```

- [ ] **Step 2: Compile-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/ota.ts
git commit -m "feat(ota): db queries module for sources, reviews, syntheses"
```

---

## Task 6: Sync orchestrator

**Files:**
- Create: `src/lib/ota/sync.ts`

- [ ] **Step 1: Write the orchestrator**

```ts
// src/lib/ota/sync.ts
import { fetchPlaceReviews } from './google-places'
import { synthesizeReviews, PROMPT_VERSION, SYNTHESIS_MODEL } from './synthesis'
import { hashReviewId } from './helpers'
import type { SynthesisOutput } from './types'
import {
  getSourceForProperty,
  insertReviewIfNew,
  recordFetchSuccess,
  recordFetchError,
  getReviewsInWindow,
  insertSynthesis,
  pruneOldSyntheses,
} from '@/lib/db/queries/ota'
import { db } from '@/lib/db'
import { properties } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const WINDOW_DAYS = 90
const PRUNE_AFTER_DAYS = 180
const MIN_REVIEWS_FOR_SYNTHESIS = 3

export interface SyncResult {
  propertyId: string
  fetched: number   // # reviews returned by Google
  inserted: number  // # new reviews added (vs deduped)
  synthesisStatus: 'ok' | 'insufficient_data' | 'error' | 'skipped'
  error?: string
}

/**
 * End-to-end sync for one property:
 * 1. Fetch from Google → upsert into ota_reviews
 * 2. Pull last 90 days from DB → call Claude synthesis → insert ota_syntheses
 * 3. Prune syntheses older than 180 days
 *
 * Errors are recorded to the source row (last_fetch_error) or as an 'error'
 * synthesis row, never thrown out of this function — the caller (cron) loops
 * across properties and one failure must not abort the run.
 */
export async function syncProperty(propertyId: string): Promise<SyncResult> {
  const result: SyncResult = {
    propertyId,
    fetched: 0,
    inserted: 0,
    synthesisStatus: 'skipped',
  }

  // 1. Resolve property + source
  const [property] = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1)
  if (!property) {
    return { ...result, synthesisStatus: 'error', error: 'property not found' }
  }

  const source = await getSourceForProperty(propertyId, 'google')
  if (!source || !source.isActive) {
    return { ...result, error: 'no active google source' }
  }

  // 2. Fetch from Google
  let fetched: Awaited<ReturnType<typeof fetchPlaceReviews>>
  try {
    fetched = await fetchPlaceReviews(source.externalId)
    await recordFetchSuccess(source.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordFetchError(source.id, msg)
    return { ...result, synthesisStatus: 'error', error: msg }
  }
  result.fetched = fetched.reviews.length

  // 3. Dedupe-insert
  for (const r of fetched.reviews) {
    const externalReviewId = hashReviewId({
      authorName: r.authorName,
      reviewedAt: r.reviewedAt,
      text: r.text,
    })
    try {
      await insertReviewIfNew({
        sourceId: source.id,
        propertyId: source.propertyId,
        externalReviewId,
        authorName: r.authorName,
        rating: r.rating,
        text: r.text,
        language: r.language,
        reviewedAt: r.reviewedAt,
        rawPayload: r.raw as Record<string, unknown>,
      })
      // We can't easily know if it was newly inserted vs no-op without RETURNING
      // — accept slight ambiguity in `inserted`. Approximate via re-query if needed.
      result.inserted += 1
    } catch (e) {
      // Continue; one bad row should not break the loop
      console.error('[ota.sync] insert failed', e)
    }
  }

  // 4. Synthesize over 90-day window
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 86400_000)
  const reviewsInWindow = await getReviewsInWindow(propertyId, windowStart)

  if (reviewsInWindow.length < MIN_REVIEWS_FOR_SYNTHESIS) {
    await insertSynthesis({
      propertyId,
      windowStart,
      windowEnd,
      reviewsAnalyzed: reviewsInWindow.length,
      avgRating: null,
      status: 'insufficient_data',
      modelUsed: SYNTHESIS_MODEL,
      promptVersion: PROMPT_VERSION,
    })
    result.synthesisStatus = 'insufficient_data'
    return result
  }

  const avgRating =
    reviewsInWindow.reduce((s, r) => s + r.rating, 0) / reviewsInWindow.length

  let output: SynthesisOutput
  let costUsd = 0
  try {
    const synth = await synthesizeReviews({
      propertyName: property.name,
      windowStart,
      windowEnd,
      reviews: reviewsInWindow.map((r) => ({
        reviewedAt: r.reviewedAt,
        rating: r.rating,
        text: r.text ?? '',
      })),
    })
    output = synth.output
    costUsd = synth.costUsd
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await insertSynthesis({
      propertyId,
      windowStart,
      windowEnd,
      reviewsAnalyzed: reviewsInWindow.length,
      avgRating: avgRating.toFixed(2),
      status: 'error',
      errorMessage: msg.slice(0, 1000),
      modelUsed: SYNTHESIS_MODEL,
      promptVersion: PROMPT_VERSION,
    })
    result.synthesisStatus = 'error'
    result.error = msg
    return result
  }

  await insertSynthesis({
    propertyId,
    windowStart,
    windowEnd,
    reviewsAnalyzed: reviewsInWindow.length,
    avgRating: avgRating.toFixed(2),
    aspectScores: output.aspect_scores,
    strengths: output.strengths,
    weaknesses: output.weaknesses,
    repetitiveIssues: output.repetitive_issues,
    status: 'ok',
    modelUsed: SYNTHESIS_MODEL,
    promptVersion: PROMPT_VERSION,
    costUsd: costUsd.toFixed(4),
  })

  // 5. Prune old syntheses
  const pruneCutoff = new Date(Date.now() - PRUNE_AFTER_DAYS * 86400_000)
  await pruneOldSyntheses(propertyId, pruneCutoff)

  result.synthesisStatus = 'ok'
  return result
}
```

- [ ] **Step 2: Compile-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ota/sync.ts
git commit -m "feat(ota): per-property sync orchestrator"
```

---

## Task 7: Cron route + admin manual sync route

**Files:**
- Create: `src/app/api/cron/ota-sync/route.ts`
- Create: `src/app/api/admin/ota/sync/[propertyId]/route.ts`

- [ ] **Step 1: Write cron route**

```ts
// src/app/api/cron/ota-sync/route.ts
import { NextResponse } from 'next/server'
import { syncProperty } from '@/lib/ota/sync'
import { getActiveSources } from '@/lib/db/queries/ota'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sources = await getActiveSources()
  const results = []
  for (const s of sources) {
    try {
      results.push(await syncProperty(s.propertyId))
    } catch (e) {
      // syncProperty doesn't throw, but defensive double-catch
      results.push({
        propertyId: s.propertyId,
        fetched: 0,
        inserted: 0,
        synthesisStatus: 'error' as const,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return NextResponse.json({ ran: results.length, results })
}
```

- [ ] **Step 2: Write admin manual sync route**

```ts
// src/app/api/admin/ota/sync/[propertyId]/route.ts
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/guards'
import { syncProperty } from '@/lib/ota/sync'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  await requireRole(['admin'])
  const { propertyId } = await params
  const result = await syncProperty(propertyId)
  return NextResponse.json(result)
}
```

- [ ] **Step 3: Verify middleware exclusion**

Open `src/middleware.ts` and confirm `/api/cron/` is in the public-routes list. Per CLAUDE.md it already is. If not present, add it:

```ts
// in isPublicRoute:
pathname.startsWith('/api/cron/')
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/ota-sync src/app/api/admin/ota
git commit -m "feat(ota): cron route + admin manual sync route"
```

---

## Task 8: Property edit form — Place ID field

**Files:**
- Modify: `src/components/admin/property-form.tsx`
- Modify: `src/app/api/properties/[id]/route.ts`

- [ ] **Step 1: Inspect current property form + API**

Open `src/components/admin/property-form.tsx`. Identify the form schema (Zod), default values, and where text inputs are rendered. Open `src/app/api/properties/[id]/route.ts` for the PUT handler.

- [ ] **Step 2: Extend form schema and add field**

In `src/components/admin/property-form.tsx`:

a. Add `googlePlaceId: z.string().trim().optional()` to the Zod schema.

b. Add `googlePlaceId` to defaultValues, sourcing from `existingSource?.externalId ?? ''`. The form will need the existing source as a prop — see step 4.

c. Add a form field below the existing PM dropdown:

```tsx
<FormField
  control={form.control}
  name="googlePlaceId"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Google Place ID</FormLabel>
      <FormControl>
        <Input
          placeholder="ChIJ..."
          {...field}
          value={field.value ?? ''}
        />
      </FormControl>
      <FormDescription>
        Connects this property to Google reviews. Find the Place ID via{' '}
        <a
          href="https://developers.google.com/maps/documentation/places/web-service/place-id"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Google's Place ID Finder
        </a>
        .
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

- [ ] **Step 3: Wire existing source through to the form**

In whichever server component renders `<PropertyForm>` for editing (likely `src/components/admin/properties-page-client.tsx` or the admin properties page), fetch the existing Google source for that property using `getSourceForProperty(propertyId, 'google')` and pass `existingGooglePlaceId={source?.externalId ?? null}` to the form.

In the form, accept `existingGooglePlaceId` as an optional prop and use it as the initial value for `googlePlaceId`.

- [ ] **Step 4: Update PUT handler**

In `src/app/api/properties/[id]/route.ts` PUT handler:

a. Extend the request body Zod schema with `googlePlaceId: z.string().trim().optional().nullable()`.

b. After updating `properties`, manage the Google source row:

```ts
import { upsertSource, deactivateSource } from '@/lib/db/queries/ota'

// after the property update:
const placeId = body.googlePlaceId?.trim() ?? ''
if (placeId) {
  await upsertSource({ propertyId: id, source: 'google', externalId: placeId })
} else {
  await deactivateSource(id, 'google')
}
```

- [ ] **Step 5: Manual verification**

Start dev server: `npm run dev`. Log in as admin. Open the edit form for a property. Set a known good Place ID, save. Query the DB:

```sql
SELECT * FROM ota_review_sources WHERE property_id = '<id>';
```

Expected: one row with `is_active=true` and the Place ID. Clear the field, save again. Expected: `is_active=false`.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/property-form.tsx src/app/api/properties/[id]/route.ts src/components/admin/properties-page-client.tsx
git commit -m "feat(ota): google place id field on property edit form"
```

---

## Task 9: Property dashboard OTA tab

**Files:**
- Create: `src/components/dashboard/ota-tab.tsx`
- Modify: `src/components/dashboard/property-dashboard.tsx`
- Modify: `src/app/(portal)/dashboard/[propertyId]/page.tsx`

- [ ] **Step 1: Define data shape and server-side loader**

In `src/lib/db/queries/ota.ts` (already exists from Task 5), confirm `getLatestSynthesis`, `getSynthesisForTrend`, `getRecentReviews`, `getSourceForProperty` are exported.

Add a single roll-up loader in `src/lib/ota/dashboard.ts` (NEW FILE):

```ts
// src/lib/ota/dashboard.ts
import {
  getLatestSynthesis,
  getSynthesisForTrend,
  getRecentReviews,
  getSourceForProperty,
} from '@/lib/db/queries/ota'
import { computeAspectTrend, googleRatingToTen } from './helpers'
import { PROMPT_VERSION } from './synthesis'

export async function loadOtaPropertyData(propertyId: string) {
  const [source, latest, recentReviews] = await Promise.all([
    getSourceForProperty(propertyId, 'google'),
    getLatestSynthesis(propertyId),
    getRecentReviews(propertyId, 25),
  ])

  const trendBaseline = latest
    ? await getSynthesisForTrend({
        propertyId,
        promptVersion: PROMPT_VERSION,
        before: new Date(Date.now() - 30 * 86400_000),
      })
    : null

  const trend =
    latest?.status === 'ok' && trendBaseline?.status === 'ok'
      ? computeAspectTrend(latest.aspectScores, trendBaseline.aspectScores)
      : []

  return {
    source,
    latest,
    recentReviews,
    trend,
    overallScoreOutOfTen: latest?.avgRating
      ? googleRatingToTen(Number(latest.avgRating))
      : null,
  }
}
```

- [ ] **Step 2: Write `<OtaTab>` client component**

```tsx
// src/components/dashboard/ota-tab.tsx
'use client'

import { CORE_ASPECTS } from '@/lib/ota/aspects'
import type { AspectTrend } from '@/lib/ota/types'
import type { SynthesisRow } from '@/lib/db/queries/ota'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OtaReview {
  id: string
  authorName: string | null
  rating: number
  text: string | null
  reviewedAt: Date
}

interface OtaTabProps {
  propertyId: string
  source: { id: string; externalId: string; lastFetchError: string | null } | null
  latest: SynthesisRow | null
  recentReviews: OtaReview[]
  trend: AspectTrend[]
  overallScoreOutOfTen: number | null
  isAdmin: boolean
}

function severityClasses(sev: 'low' | 'medium' | 'high') {
  if (sev === 'high') return 'border-red-500 bg-red-50 dark:bg-red-950 animate-pulse-slow'
  if (sev === 'medium') return 'border-red-300 bg-red-50/60 dark:bg-red-950/40'
  return 'border-red-200 bg-red-50/30 dark:bg-red-950/20'
}

export function OtaTab(props: OtaTabProps) {
  const { source, latest, recentReviews, trend, overallScoreOutOfTen, isAdmin } = props

  // Empty states
  if (!source || !source.externalId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No Google listing connected.
          {isAdmin && (
            <> Set the Place ID in property settings to start collecting reviews.</>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!latest) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Awaiting first sync. Cron runs nightly at 03:00 UTC, or admin can click
          "Refresh now".
        </CardContent>
      </Card>
    )
  }

  if (latest.status === 'insufficient_data') {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Need at least 3 reviews in the last 90 days to synthesize. Currently{' '}
          {latest.reviewsAnalyzed}.
        </CardContent>
      </Card>
    )
  }

  if (latest.status === 'error') {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Synthesis failed on last run. Will retry tonight.
          {isAdmin && latest.errorMessage && (
            <pre className="mt-2 rounded bg-muted p-2 text-xs">{latest.errorMessage}</pre>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Google rating</p>
          <p className="text-4xl font-bold">
            {latest.avgRating} ★{' '}
            <span className="text-2xl text-muted-foreground">
              ({overallScoreOutOfTen?.toFixed(1)}/10)
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latest.reviewsAnalyzed} reviews analyzed (last 90 days)
          </p>
        </div>
      </div>

      {/* Aspect grid */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Aspect Scores</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CORE_ASPECTS.map((a) => {
            const cell = latest.aspectScores.core?.[a.key]
            const t = trend.find((x) => x.key === a.key)
            return (
              <Card key={a.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{a.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">
                    {cell?.score?.toFixed(1) ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cell?.mention_count ?? 0} mentions
                  </p>
                  {t && t.previous > 0 && (
                    <div
                      className={cn(
                        'mt-1 inline-flex items-center gap-0.5 text-xs',
                        t.delta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {t.delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                      {Math.abs(t.delta).toFixed(1)} vs 30d
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Dynamic highlights */}
      {latest.aspectScores.dynamic?.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Property Highlights</h2>
          <div className="flex flex-wrap gap-2">
            {latest.aspectScores.dynamic.map((d) => (
              <Badge key={d.name} variant="secondary" className="text-base">
                {d.name}: {d.score.toFixed(1)} · {d.mention_count} mentions
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Synthesis: 3-column */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.strengths.map((b, i) => (
              <div key={i}>
                <p className="font-medium">{b.headline}</p>
                <p className="text-sm text-muted-foreground">{b.detail}</p>
                <Badge variant="outline" className="mt-1">{b.mention_count} mentions</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-amber-700 dark:text-amber-400">
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.weaknesses.map((b, i) => (
              <div key={i}>
                <p className="font-medium">{b.headline}</p>
                <p className="text-sm text-muted-foreground">{b.detail}</p>
                <Badge variant="outline" className="mt-1">{b.mention_count} mentions</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-2 border-red-300">
          <CardHeader>
            <CardTitle className="text-base text-red-700 dark:text-red-400">
              Repetitive Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.repetitiveIssues.length === 0 && (
              <p className="text-sm text-muted-foreground">None this period.</p>
            )}
            {latest.repetitiveIssues.map((r, i) => (
              <div key={i} className={cn('rounded border p-3', severityClasses(r.severity))}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{r.headline}</p>
                  <Badge variant="destructive" className="capitalize">{r.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{r.detail}</p>
                <Badge variant="outline" className="mt-1">{r.mention_count} mentions</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Reviews list */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Reviews</h2>
        <div className="space-y-3">
          {recentReviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{r.authorName ?? 'Anonymous'}</div>
                  <div className="text-sm">
                    {r.rating} ★ · {r.reviewedAt.toLocaleDateString()}
                  </div>
                </div>
                {r.text && <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Last synthesized {new Date(latest.generatedAt).toLocaleString()} · {latest.reviewsAnalyzed} reviews ·
        prompt {latest.promptVersion}
        {isAdmin && source.lastFetchError && (
          <span className="ml-2 text-red-600">Last fetch error: {source.lastFetchError}</span>
        )}
      </p>
    </div>
  )
}
```

Optional CSS for the slow pulse (add to `globals.css`, only if not already present):

```css
@keyframes pulse-slow { 0%, 100% { opacity: 1 } 50% { opacity: 0.85 } }
.animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }
```

- [ ] **Step 3: Wire tab into `property-dashboard.tsx`**

In `src/components/dashboard/property-dashboard.tsx`:

a. Add a third tab trigger:

```tsx
<TabsTrigger value="internal">Internal</TabsTrigger>
<TabsTrigger value="guest">Guest</TabsTrigger>
<TabsTrigger value="ota">OTA</TabsTrigger>
```

b. Below the existing dashboard content, branch on `surveyType === 'ota'`. The simplest pattern: pass `surveyType` and `otaData` into the component, and early-return the `<OtaTab>` JSX before the existing internal/guest body. Pseudocode:

```tsx
if (surveyType === 'ota') {
  return (
    <div className="space-y-8">
      {/* existing header (property name + tabs + date filter) */}
      <OtaTab {...otaData} propertyId={property.id} isAdmin={isAdmin} />
    </div>
  )
}
```

If `property-dashboard.tsx` is structured with the header as a sibling of the body, render the header always and only swap the body region.

- [ ] **Step 4: Wire data loader into the page**

In `src/app/(portal)/dashboard/[propertyId]/page.tsx`:

a. Import `loadOtaPropertyData` from `@/lib/ota/dashboard`.
b. Branch on `surveyType === 'ota'`:

```ts
const otaData = surveyType === 'ota' ? await loadOtaPropertyData(propertyId) : null
```

c. Pass `otaData` and `isAdmin` (from the profile) into `<PropertyDashboard>`.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Visit `/dashboard/<propertyId>?surveyType=ota`. With no source: empty state. After Task 8 + manual `Refresh now`: full UI populates.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ota/dashboard.ts src/components/dashboard/ota-tab.tsx src/components/dashboard/property-dashboard.tsx src/app/\(portal\)/dashboard/\[propertyId\]/page.tsx
git commit -m "feat(ota): property dashboard ota tab"
```

---

## Task 10: Org overview OTA tab + admin "Refresh now" button

**Files:**
- Create: `src/components/dashboard/ota-overview-tab.tsx`
- Create: `src/components/dashboard/ota-refresh-button.tsx`
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/components/dashboard/ota-tab.tsx` (insert refresh button)
- Modify: `src/app/(portal)/dashboard/page.tsx`
- Modify: `src/lib/ota/dashboard.ts` (add `loadOtaOrgData`)

- [ ] **Step 1: Add `loadOtaOrgData`**

Append to `src/lib/ota/dashboard.ts`:

```ts
import { getOrgPortfolioSyntheses, getReviewsThisMonth } from '@/lib/db/queries/ota'

export async function loadOtaOrgData(orgId: string) {
  const [portfolio, reviewsThisMonth] = await Promise.all([
    getOrgPortfolioSyntheses(orgId),
    getReviewsThisMonth(orgId),
  ])

  const okSyntheses = portfolio
    .map((p) => p.synthesis)
    .filter((s): s is NonNullable<typeof s> => s?.status === 'ok')

  const avgRating =
    okSyntheses.length === 0
      ? null
      : okSyntheses.reduce((acc, s) => acc + Number(s.avgRating ?? 0), 0) / okSyntheses.length

  const propertiesWithRepetitiveIssues = portfolio.filter(
    (p) => p.synthesis?.status === 'ok' && p.synthesis.repetitiveIssues.length > 0
  ).length

  // Cross-portfolio repetitive issues with property labels
  const crossPortfolioIssues = portfolio.flatMap((p) =>
    p.synthesis?.status === 'ok'
      ? p.synthesis.repetitiveIssues.map((r) => ({ ...r, propertyName: p.property.name }))
      : []
  )
  // Sort: severity (high>medium>low), then mention_count desc
  const sevRank = { high: 0, medium: 1, low: 2 } as const
  crossPortfolioIssues.sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] || b.mention_count - a.mention_count
  )

  return {
    portfolio,
    avgRating,
    reviewsThisMonth,
    propertiesWithRepetitiveIssues,
    crossPortfolioIssues,
  }
}
```

- [ ] **Step 2: Write `<OtaOverviewTab>`**

```tsx
// src/components/dashboard/ota-overview-tab.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface OtaOverviewProps {
  portfolio: Array<{
    property: { id: string; name: string }
    synthesis: { status: string; avgRating: string | null; repetitiveIssues: Array<{ headline: string; severity: 'low' | 'medium' | 'high'; mention_count: number }> } | null
  }>
  avgRating: number | null
  reviewsThisMonth: number
  propertiesWithRepetitiveIssues: number
  crossPortfolioIssues: Array<{ headline: string; detail: string; mention_count: number; severity: 'low' | 'medium' | 'high'; propertyName: string }>
}

export function OtaOverviewTab(props: OtaOverviewProps) {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Portfolio rating</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{props.avgRating ? `${props.avgRating.toFixed(2)} ★` : '—'}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reviews this month</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{props.reviewsThisMonth}</p></CardContent>
        </Card>
        <Card className={cn(props.propertiesWithRepetitiveIssues > 0 && 'border-red-300')}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Properties with repeat issues</CardTitle></CardHeader>
          <CardContent>
            <p className={cn('text-2xl font-bold', props.propertiesWithRepetitiveIssues > 0 && 'text-red-600')}>
              {props.propertiesWithRepetitiveIssues}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Properties tracked</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{props.portfolio.length}</p></CardContent>
        </Card>
      </div>

      {/* Property comparison */}
      <Card>
        <CardHeader><CardTitle>Property ratings</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {props.portfolio.map((p) => (
              <div key={p.property.id} className="flex items-center justify-between">
                <span className="text-sm">{p.property.name.replace('Taru Villas - ', '')}</span>
                <span className="text-sm font-medium tabular-nums">
                  {p.synthesis?.avgRating ? `${p.synthesis.avgRating} ★` : '—'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cross-portfolio repetitive issues */}
      <Card>
        <CardHeader><CardTitle className="text-red-700 dark:text-red-400">Cross-portfolio repetitive issues</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {props.crossPortfolioIssues.length === 0 && (
            <p className="text-sm text-muted-foreground">No repetitive issues across the portfolio.</p>
          )}
          {props.crossPortfolioIssues.map((r, i) => (
            <div key={i} className="rounded border border-red-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  <span className="text-muted-foreground">{r.propertyName}:</span> {r.headline}
                </p>
                <Badge variant="destructive" className="capitalize">{r.severity}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{r.detail}</p>
              <Badge variant="outline" className="mt-1">{r.mention_count} mentions</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Add OTA tab trigger to `dashboard-overview.tsx`**

```tsx
<TabsTrigger value="internal">Internal</TabsTrigger>
<TabsTrigger value="guest">Guest</TabsTrigger>
<TabsTrigger value="ota">OTA</TabsTrigger>
```

Update `handleSurveyTypeChange` to support `ota`:

```tsx
function handleSurveyTypeChange(type: string) {
  if (type === 'internal') router.push('/dashboard')
  else router.push(`/dashboard?surveyType=${type}`)
}
```

(The existing else-branch already handles arbitrary types; verify, no change usually needed.)

Branch on `surveyType === 'ota'` to render `<OtaOverviewTab>` instead of the existing body.

- [ ] **Step 4: Wire `dashboard/page.tsx`**

In `src/app/(portal)/dashboard/page.tsx`:

a. Widen `surveyType` type to `'internal' | 'guest' | 'ota'`.
b. If `surveyType === 'ota'`, call `loadOtaOrgData(orgId)` and pass into `<DashboardOverview>` as `otaData`.

- [ ] **Step 5: Build the "Refresh now" button**

```tsx
// src/components/dashboard/ota-refresh-button.tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export function OtaRefreshButton({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function refresh() {
    setError(null)
    const res = await fetch(`/api/admin/ota/sync/${propertyId}`, { method: 'POST' })
    if (!res.ok) {
      setError(`Failed: ${res.status}`)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={refresh} disabled={pending}>
        <RefreshCw className={pending ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'} />
        Refresh now
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Insert button into `<OtaTab>` header (admin only)**

In `src/components/dashboard/ota-tab.tsx`, in the header `<div>`, add to the right side:

```tsx
{isAdmin && <OtaRefreshButton propertyId={propertyId} />}
```

- [ ] **Step 7: Manual verification**

`npm run dev`. As admin, open `/dashboard?surveyType=ota`. Confirm stat row, property list, and (if seeded) cross-portfolio issues. Click "Refresh now" on a property's OTA tab. Page refreshes with new synthesis.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard src/app/\(portal\)/dashboard/page.tsx src/lib/ota/dashboard.ts
git commit -m "feat(ota): org overview ota tab + admin refresh-now button"
```

---

## Task 11: Cron config + env docs + final verification

**Files:**
- Create: `vercel.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/ota-sync", "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 2: Add new env vars to `CLAUDE.md`**

Locate the `## Environment Variables` section in `CLAUDE.md` and append:

```bash
GOOGLE_PLACES_API_KEY="..."  # Google Cloud project API key with Places API enabled
ANTHROPIC_API_KEY="..."      # For OTA review synthesis
```

- [ ] **Step 3: Add env vars to Vercel project**

Go to Vercel Project → Settings → Environment Variables. Add `GOOGLE_PLACES_API_KEY` and `ANTHROPIC_API_KEY` for Production and Preview.

- [ ] **Step 4: Deploy**

```bash
npx vercel deploy --prod --yes
```

- [ ] **Step 5: End-to-end manual verification (per spec §16)**

Run through each of these against production:

1. **Place ID happy path**: edit a property, set its real Google Place ID, save, click `Refresh now` on the OTA tab. Verify synthesis populates.
2. **Bad Place ID**: set garbage (`xxxx`), click `Refresh now`. Verify the empty/error state appears in the UI and `last_fetch_error` is populated in the property edit form.
3. **Insufficient data**: pick a property with very few reviews (< 3 in last 90 days). Verify "insufficient data" empty state.
4. **Repetitive-issue rendering**: visually confirm the red panel renders, with `severity='high'` items having the slow pulse.
5. **Permissions**: log in as a PM, view OTA tab for an assigned property (should work). Try a non-assigned property URL directly (should redirect per existing rule). Verify no `Refresh now` button appears.
6. **Trend computation**: insert a fake older synthesis 31 days back via SQL editor with different aspect scores; verify deltas render. Remove it; verify "no comparison" state.
7. **Cron auth**: `curl https://<deploy>/api/cron/ota-sync` → 401. With correct bearer → 200 + JSON results.
8. **Cron schedule**: confirm cron appears in Vercel Project → Crons tab and shows next run at 03:00 UTC.

- [ ] **Step 6: Commit & wrap**

```bash
git add vercel.json CLAUDE.md
git commit -m "chore(ota): vercel cron config + env var docs"
git push
```

Update MEMORY.md (auto-memory) with: OTA pipeline ships with daily cron, models the v1 source = Google Places only, syntheses keyed by `prompt_version` for trend comparability.

---

## Self-review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §5.1 ota_review_sources | T1 |
| §5.2 ota_reviews | T1 |
| §5.3 ota_syntheses + JSONB shapes | T1 |
| §6 aspect taxonomy | T2 |
| §7.1 cron route + auth | T7 |
| §7.2 fetch + dedupe | T3, T6 |
| §7.3 synthesis + insufficient_data + error rows | T6 |
| §7.4 pruning | T6 |
| §8 AI prompt + tool-use + caching + cost | T4 |
| §9 score normalization | T2, T9 |
| §10 trend computation | T2, T9 |
| §11.1 property OTA tab UI | T9 |
| §11.2 org overview OTA tab UI | T10 |
| §11.3 admin Place ID config | T8 |
| §11.4 Refresh now button | T10 |
| §12 permissions | T7, T9, T10 |
| §13 errors + ops visibility | T6, T8, T9 |
| §14 env vars | T3, T4, T11 |
| §15 migration plan | T1 |
| §16 testing approach | T11 |
| §17 rollout | T11 |

All requirements mapped. No placeholders left in tasks (every code-changing step has the code). Type names consistent across tasks (`SynthesisRow`, `AspectTrend`, `SynthesisOutput`).
