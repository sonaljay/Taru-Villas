# OTA Reviews Dashboard — Design Spec

**Date:** 2026-04-29
**Status:** Approved for implementation planning
**Scope:** v1 — Google Places only

---

## 1. Goal

Add a third surface to the dashboard alongside Internal and Guest surveys: **OTA**. It pulls public guest reviews for each Taru property and runs them through Claude to surface:

- A normalized score per property (×2 of Google's 1-5 stars → 1-10).
- Aspect-level scores (Cleanliness, Staff, Food, Location, Value, Comfort, Facilities) plus 1-2 dynamic property-specific aspects.
- Three textual buckets per property: **Strengths**, **Weaknesses**, **Repetitive Issues**.
- A portfolio-level rollup on the org overview dashboard.

Repetitive issues are visually flagged so a PM can spot recurring complaints at a glance. v1 is read-only — it does not auto-create tasks.

## 2. Non-goals

- Booking.com & TripAdvisor (deferred; schema is source-agnostic so they slot in later).
- Auto-task creation from repetitive issues.
- Per-bullet citation links from synthesized text to specific underlying reviews.
- Backfilling historical reviews (Google Places API caps at 5 reviews per call; we accumulate from now forward).
- Replying to reviews from inside the app.

## 3. Constraints discovered during brainstorming

- **Google Places API hard-caps at 5 reviews per call** (both legacy and "New" Places API). No paid tier or partner program lifts this. Therefore: we fetch daily, dedupe into our own DB, and history accumulates naturally over weeks/months.
- **Drizzle migration history is broken** for this project (recorded in MEMORY.md). Schema changes are hand-written SQL files applied via Supabase SQL editor. New migration here is `drizzle/0012_ota_reviews.sql`.
- Existing `survey_type` enum values (`internal`, `guest`) intentionally not extended — OTA reviews are not surveys and don't fit the `categories → subcategories → questions` schema.

## 4. Architecture

OTA runs as an isolated pipeline parallel to surveys:

```
Daily cron (03:00 UTC)
  └─> /api/cron/ota-sync
        ├─ For each active ota_review_source:
        │    1. Fetch Google Places Details (5 reviews max)
        │    2. Upsert into ota_reviews (dedup by sha256(author+time+text))
        │    3. Update last_fetched_at; record per-source errors
        │
        └─ For each property with ≥ 3 reviews in window:
             4. Pull last 90 days of ota_reviews
             5. Synthesize via Claude (sonnet-4-6, structured output)
             6. INSERT INTO ota_syntheses (snapshot)
             7. Prune syntheses older than 180 days
```

Dashboard UI reads the latest `ota_syntheses` row per property + recent `ota_reviews`.

## 5. Data model

Three new tables. Migration: `drizzle/0012_ota_reviews.sql`.

### 5.1 `ota_review_sources`

Per-property external listing config. One row per (property, source) pair.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` default |
| `property_id` | uuid NOT NULL | FK → `properties.id` ON DELETE CASCADE |
| `source` | text NOT NULL | CHECK IN (`'google'`) — extend later for `'booking'`, `'tripadvisor'` |
| `external_id` | text NOT NULL | Google Place ID |
| `is_active` | bool NOT NULL DEFAULT true | toggle to pause sync per property |
| `last_fetched_at` | timestamptz | last successful fetch |
| `last_fetch_error` | text | last failure reason (cleared on success) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Constraints: `UNIQUE (property_id, source)`.

### 5.2 `ota_reviews`

Deduped raw review storage. Append-only.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `source_id` | uuid NOT NULL | FK → `ota_review_sources.id` ON DELETE CASCADE |
| `property_id` | uuid NOT NULL | FK → `properties.id` ON DELETE CASCADE — denormalized for query speed |
| `external_review_id` | text NOT NULL | `sha256(author_name + reviewed_at + text)` — Google has no stable review ID |
| `author_name` | text | nullable (Google may anonymize) |
| `rating` | int NOT NULL | 1-5 (Google scale) |
| `text` | text | nullable (rare star-only reviews) |
| `language` | text | ISO code from Google |
| `reviewed_at` | timestamptz NOT NULL | review's own timestamp |
| `fetched_at` | timestamptz NOT NULL DEFAULT now() | when we ingested |
| `raw_payload` | jsonb | full Google review object — debug + future fields |

Constraints: `UNIQUE (source_id, external_review_id)`.
Index: `(property_id, reviewed_at DESC)` — drives dashboard reads.

### 5.3 `ota_syntheses`

One row per property per cron run (snapshots).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `property_id` | uuid NOT NULL | FK → `properties.id` ON DELETE CASCADE |
| `generated_at` | timestamptz NOT NULL DEFAULT now() | |
| `window_start` | timestamptz NOT NULL | start of analysed window |
| `window_end` | timestamptz NOT NULL | end of analysed window |
| `reviews_analyzed` | int NOT NULL | sample size |
| `avg_rating` | numeric(3,2) | mean star rating in window (nullable on error / insufficient_data rows) |
| `aspect_scores` | jsonb NOT NULL DEFAULT `'{}'` | see shape below; empty `{}` for non-`ok` rows |
| `strengths` | jsonb NOT NULL DEFAULT `'[]'` | see shape below; empty `[]` for non-`ok` rows |
| `weaknesses` | jsonb NOT NULL DEFAULT `'[]'` | see shape below; empty `[]` for non-`ok` rows |
| `repetitive_issues` | jsonb NOT NULL DEFAULT `'[]'` | see shape below; empty `[]` for non-`ok` rows |
| `status` | text NOT NULL DEFAULT `'ok'` | `'ok'` \| `'insufficient_data'` \| `'error'` |
| `error_message` | text | populated only when `status='error'` |
| `model_used` | text NOT NULL | e.g. `claude-sonnet-4-6` |
| `prompt_version` | text NOT NULL | e.g. `v1` — bump when prompt changes; comparable trend math requires same prompt_version |
| `cost_usd` | numeric(8,4) | ops visibility |

Index: `(property_id, generated_at DESC)` — drives "latest synthesis" read and trend lookup.

#### JSONB shapes

```json
// aspect_scores
{
  "core": {
    "cleanliness":  { "score": 8.4, "mention_count": 12, "sample_quote": "spotless" },
    "staff":        { "score": 9.1, "mention_count": 18, "sample_quote": "..." },
    "food":         { "score": 7.0, "mention_count": 9,  "sample_quote": "..." },
    "location":     { "score": 8.8, "mention_count": 6,  "sample_quote": "..." },
    "value":        { "score": 7.5, "mention_count": 4,  "sample_quote": "..." },
    "comfort":      { "score": 8.0, "mention_count": 11, "sample_quote": "..." },
    "facilities":   { "score": 7.6, "mention_count": 7,  "sample_quote": "..." }
  },
  "dynamic": [
    { "name": "Pool", "score": 9.2, "mention_count": 5 },
    { "name": "Heritage architecture", "score": 9.0, "mention_count": 4 }
  ]
}

// strengths / weaknesses
[
  { "headline": "Warm staff hospitality", "detail": "Guests repeatedly mention by name…", "mention_count": 8 }
]

// repetitive_issues
[
  { "headline": "Hot water inconsistency", "detail": "Three reviews flag inconsistent hot water in upper rooms", "mention_count": 4, "severity": "high" }
]
```

Severity: `low` | `medium` | `high`. AI-assigned. UI uses red border + pulse for `high`, plain red for `medium`/`low`.

## 6. Aspect taxonomy

Hard-coded core aspects in `src/lib/ota/aspects.ts`:

```ts
export const CORE_ASPECTS = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'staff',       label: 'Staff & Service' },
  { key: 'food',        label: 'Food & Dining' },
  { key: 'location',    label: 'Location' },
  { key: 'value',       label: 'Value for Money' },
  { key: 'comfort',     label: 'Comfort & Room' },
  { key: 'facilities',  label: 'Facilities & Amenities' },
] as const
```

Dynamic aspects: AI surfaces 1-2 property-specific aspects beyond the core. Capped at 2 to avoid taxonomy drift between runs.

## 7. Pipeline

### 7.1 Cron route — `/api/cron/ota-sync`

- **Schedule:** `0 3 * * *` (03:00 UTC = ~09:00 IST). Configured in `vercel.json`.
- **Auth:** `Authorization: Bearer ${CRON_SECRET}`. Existing pattern (already excluded from Supabase auth in `src/middleware.ts`).
- **Concurrency:** serial loop over properties — Google quota is generous, ~7 properties, no need for parallelism.

### 7.2 Fetch step

For each `ota_review_source` where `is_active = true`:

1. `GET https://maps.googleapis.com/maps/api/place/details/json?place_id=${external_id}&fields=reviews,rating,user_ratings_total&key=${GOOGLE_PLACES_API_KEY}`
2. For each review in response:
   - Compute `external_review_id = sha256(author_name + time + text)` (Buffer → hex)
   - `INSERT INTO ota_reviews (...) ON CONFLICT (source_id, external_review_id) DO NOTHING`
3. On success: `UPDATE ota_review_sources SET last_fetched_at = now(), last_fetch_error = NULL`
4. On failure: `UPDATE ota_review_sources SET last_fetch_error = '<message>'`. Log + continue. Per-source isolation: one bad place ID does not break the run.

### 7.3 Synthesis step

For each property that has any `ota_review_source`:

1. Pull `ota_reviews` for the property where `reviewed_at >= now() - interval '90 days'`, ordered by `reviewed_at DESC`.
2. If `count < 3` → insert a row with `status='insufficient_data'`, all jsonb columns = `'{}'` / `'[]'`, skip the AI call.
3. Otherwise: build the prompt (see §8), call Claude, parse the JSON tool-use response.
4. `INSERT INTO ota_syntheses (..., status='ok', ...)`.
5. On AI failure: insert with `status='error'`, `error_message`, no aspect/bullet data.

### 7.4 Pruning

After synthesis insert, `DELETE FROM ota_syntheses WHERE property_id = $1 AND generated_at < now() - interval '180 days'`. 180 days is enough to compute 90-day trends with margin.

## 8. AI synthesis details

- **Model:** `claude-sonnet-4-6` (`claude-sonnet-4-6` model ID per environment notes).
- **SDK:** `@anthropic-ai/sdk`.
- **Prompt caching:** the system prompt + JSON schema definition are cached (`cache_control: { type: 'ephemeral' }`).
- **Structured output:** use tool-use mode with a tool whose `input_schema` matches the synthesis JSON shape. Forces the model to return valid structured JSON.
- **prompt_version:** start at `'v1'`. Bump on any change to the prompt or schema.

### 8.1 System prompt (cached)

```
You are a senior hospitality review analyst. Given guest reviews for a hotel
property, produce structured insights for property managers.

Output a JSON object with:

  aspect_scores.core: for each fixed aspect (cleanliness, staff, food,
    location, value, comfort, facilities), a 0-10 score, a mention_count
    (number of input reviews that touch this theme), and a brief
    sample_quote pulled from the reviews. Score 0 if not mentioned.

  aspect_scores.dynamic: 1-2 property-specific aspects beyond the core
    (e.g., "Pool", "Beach access") with the same score+mention_count fields.
    Use only if at least 3 reviews mention the theme.

  strengths: 3-5 themes guests consistently praise. Each has headline
    (short), detail (1 sentence concrete), mention_count.

  weaknesses: 3-5 themes guests criticize. Same shape as strengths.

  repetitive_issues: themes mentioned in 3+ reviews indicating a
    structural problem. Each has headline, detail, mention_count, and
    severity (low|medium|high). Severity high = safety/health/major
    booking blocker; medium = repeated dissatisfaction; low = mild but
    persistent.

Rules:
  - Be concrete. "Hot water inconsistent in upper rooms" beats "Plumbing".
  - mention_count is the number of distinct input reviews touching the theme.
  - Use 0-10 scale (not 1-5, not percentages).
  - Don't invent themes. If the review set is thin, return shorter lists.
```

### 8.2 User prompt (per-call)

```
Property: {property_name}
Window: {window_start} to {window_end}
Review count: {n}

Reviews:
[1] {iso_date} | {rating}/5 | "{text}"
[2] ...
```

### 8.3 Repetitive issue rule

A theme is repetitive if `mention_count >= 3` AND it appears across multiple distinct reviews. The AI applies this; we don't re-derive on the server.

## 9. Score normalization

- Google rating (1-5) → 1-10 via `rating * 2`. Property header shows both: `4.6 ★ (9.2/10)`.
- Aspect scores come from AI on a 0-10 scale directly (instructed in prompt). No conversion.

## 10. Trend computation

For each fresh synthesis, compute trend deltas by querying the closest prior synthesis:

```sql
SELECT * FROM ota_syntheses
WHERE property_id = $1
  AND generated_at <= now() - interval '30 days'
  AND status = 'ok'
  AND prompt_version = $2  -- only compare across same prompt version
ORDER BY generated_at DESC
LIMIT 1
```

If found: compute deltas per aspect. If not: no trend shown (matches existing dashboard "no comparison data" state).

Trend is a render-time computation; we don't store deltas.

## 11. UI

### 11.1 Property dashboard — `/dashboard/[propertyId]`

Add a third tab `OTA` to the existing `Internal | Guest` tabs (`property-dashboard.tsx:316`).

When `OTA` is selected:

1. **Header**: Avg Google rating shown as both `4.6 ★` and `9.2/10`. `n reviews analyzed (last 90 days)`. 30-day trend arrow.
2. **Aspect grid**: re-uses `CategoryCard`. One card per fixed aspect, plus a small "Property highlights" row for the 1-2 dynamic aspects.
3. **Radar chart**: re-uses `CategoryRadar` (`property-dashboard.tsx:353`).
4. **Synthesis section** — three columns:
   - 🟢 **Strengths** — bullets with mention_count badges.
   - 🟡 **Weaknesses** — same.
   - 🔴 **Repetitive Issues** — distinct visual treatment: red border, light red background, `severity='high'` rows pulse subtly. Each bullet shows headline + detail + mention_count + severity pill.
5. **Reviews list**: paginated list of latest `ota_reviews` (25 per page). Star rating, author, date, text.
6. **Footer**: `Last synthesized {relative_time} · {n} reviews analyzed`.

Empty states:
- No `ota_review_source`: "No Google listing connected. Set Place ID in property settings." (Admin-only CTA link.)
- `status='insufficient_data'`: "We need ≥ 3 reviews in the last 90 days to synthesize. Currently {n}."
- `status='error'`: "Synthesis failed on last run. Will retry tonight." Admin sees the error_message.

### 11.2 Org overview — `/dashboard`

Add `OTA` tab (`dashboard-overview.tsx:263`).

1. **Stat row** (re-uses `StatCard`):
   - Portfolio avg rating
   - Reviews this month (from `ota_reviews` filtered to last 30 days)
   - Properties with active repetitive issues — red emphasis if > 0
   - Overall trend
2. **Property comparison bar chart**: Google rating per property.
3. **Cross-portfolio repetitive issues panel**: aggregated list of repetitive issues across all properties with property labels. Sorted by severity then mention_count.

### 11.3 Admin: property edit form

Add a `Google Place ID` input. Helper text + link to https://developers.google.com/maps/documentation/places/web-service/place-id.

On save:
- If Place ID was empty → create `ota_review_sources` row.
- If changed → update `external_id` (this invalidates dedup; old reviews remain but new ones land under the new place — acceptable, edge case).
- If cleared → set `is_active = false` (don't delete; keep history).

Visible to admin only (matches existing PM-dropdown pattern).

### 11.4 "Refresh now" button

On the property OTA tab, admin sees a small `Refresh now` button. Calls `POST /api/admin/ota/sync/[propertyId]`. Useful for testing a Place ID without waiting for cron. Admin-only.

## 12. Permissions

| Surface | admin | property_manager | staff |
|---|---|---|---|
| `/dashboard` OTA tab | full | redirect (existing rule) | redirect |
| `/dashboard/[propertyId]` OTA tab | all | assigned only | redirect |
| Place ID config in property edit | full | hidden | hidden |
| `POST /api/admin/ota/sync/[propertyId]` | yes | no | no |
| `GET /api/cron/ota-sync` | Bearer CRON_SECRET only | — | — |

## 13. Errors & ops

- **Per-source isolation**: try/catch around each property in the cron loop. One bad Place ID, quota error, or AI failure does not abort the run.
- **Visibility**:
  - `ota_review_sources.last_fetch_error` rendered next to Place ID in property edit.
  - `ota_syntheses.status='error'` shown in the OTA tab footer for admins.
- **Quota**: Google Places billing is metered; ~7 properties × 1 call/day = 210 calls/month. Far below free tier ($200/mo credit ≈ 11k Place Details calls).
- **AI cost** estimate: ~$0.02-0.05 per property per synthesis × 7 × 30 = $5-10/mo.
- **Total estimated cost**: ~$10-20/month.

## 14. Env vars (new)

```
GOOGLE_PLACES_API_KEY=...
ANTHROPIC_API_KEY=...
```

Both required in production and local `.env.local`.

## 15. Migration plan

`drizzle/0012_ota_reviews.sql` — hand-written, applied via Supabase SQL editor (per MEMORY.md). Convention: `IF NOT EXISTS`, `--> statement-breakpoint` between statements.

Order:
1. Create `ota_review_sources`
2. Create `ota_reviews` + index
3. Create `ota_syntheses` + index
4. (No enum changes — `survey_type` stays untouched.)

Schema additions in `src/lib/db/schema.ts` mirror the SQL.

## 16. Testing approach

This codebase relies on manual UI verification (no test infra). Match conventions:

1. **Place ID sanity**: set a known property's Place ID, click `Refresh now`, verify `ota_reviews` populated and `ota_syntheses` row created.
2. **Bad Place ID**: set garbage Place ID, click `Refresh now`, verify `last_fetch_error` populated and other properties unaffected.
3. **Insufficient data**: property with < 3 reviews → verify `status='insufficient_data'` row, UI shows the corresponding empty state.
4. **AI failure injection**: temporarily break `ANTHROPIC_API_KEY`, run cron → verify `status='error'` row, UI shows error state, cron continues to next property.
5. **Repetitive issue rendering**: seed a synthesis with `repetitive_issues` of varying severity, verify red border + pulse for `high`.
6. **Permissions**: PM views OTA tab for assigned property (allowed), unassigned property (blocked). Staff redirected per existing rules.
7. **Trend computation**: insert a synthesis dated 31 days ago + a fresh one with different aspect scores; verify deltas render. Insert only one synthesis → verify "no comparison" state.
8. **Cron auth**: hit `/api/cron/ota-sync` without bearer → 401. With wrong bearer → 401. With correct → runs.

## 17. Rollout

1. Apply migration via Supabase SQL editor.
2. Add env vars in Vercel project + `.env.local`.
3. Deploy. Cron starts on next 03:00 UTC.
4. Set Google Place IDs for properties via admin UI. Manually trigger `Refresh now` on each to seed.
5. Verify synthesis output for one property end-to-end before announcing.

## 18. Future work (out of scope for v1)

- Booking.com & TripAdvisor sources (schema is source-agnostic — slot in a new `source` value + new fetch adapter).
- Per-bullet citations linking back to source reviews (would need bullets to carry `review_ids`).
- Auto-task creation from repetitive issues (currently rejected; revisit if visual flagging proves insufficient).
- Manual backfill (Apify or CSV upload) if accumulating naturally proves too slow.
- Per-language sentiment splits.
- Alert/email when a new repetitive issue first appears.
