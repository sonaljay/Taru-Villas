# Water KPI Guest-Count Bands (unify with electricity) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace water's flat KPI target with the same guest-count-banded step function electricity uses, unifying both onto one `utility_kpi_bands` table.

**Architecture:** Generalize `electricity_kpi_bands` → `utility_kpi_bands` (+ `utility_type` column); parameterize the bands query/route/form by `utilityType`; the summary route + org rollup compute water targets via `resolveBandTarget(guestCount)` exactly like electricity. The unused flat-target path (`utility_kpi_targets` table, `/api/utilities/kpis`, `utility-water-kpi-form`) is removed. TLH water bands seeded.

**Tech Stack:** Next.js 16, Drizzle/postgres.js, Zod v4, shadcn/ui, lucide-react.

## Global Constraints

- **No new npm packages.** No test framework — verify by inspection. **`tsc`/`build`/`lint` HANG on the dev Mac (Node 26)** — do NOT run them; Linux CI is authoritative.
- Migrations are hand-written SQL applied manually in Supabase (drizzle-kit broken). Use guarded/idempotent SQL (`IF EXISTS`/`IF NOT EXISTS`/`ON CONFLICT`) + `--> statement-breakpoint`.
- Drizzle numeric columns are strings (`parseFloat`/`String`). All mutations `.returning()`. Route params awaited. KPI numbers stay **admin-only** (already enforced — preserve).
- **Default seed values** (form "Set up bands" defaults): electricity `0→224,1→305,6→331,11→390,16→434,21→483,26→501`; water `0→7,1→10,6→10,11→11,16→11,21→11,26→4`.
- TLH property id = `5351150a-080b-446b-a9d5-a2cb93109332`.

---

## File Structure

**Created:** `drizzle/0016_utility_kpi_bands.sql`
**Modified:** `src/lib/db/schema.ts`, `src/lib/db/queries/utilities.ts`, `src/app/api/utilities/kpi-bands/route.ts`, `src/app/api/utilities/summary/route.ts`, `src/lib/db/queries/dashboard.ts`, `src/components/admin/utility-kpi-bands-form.tsx`, `src/components/admin/utilities-page-client.tsx`
**Deleted:** `src/app/api/utilities/kpis/route.ts`, `src/components/admin/utility-water-kpi-form.tsx`

---

## Task 1: Schema generalization + migration 0016

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0016_utility_kpi_bands.sql`

**Interfaces:**
- Produces: `utilityKpiBands` table (`'utility_kpi_bands'`, columns `id, propertyId, utilityType, minGuests, targetUnits, createdAt, updatedAt`, unique `(propertyId, utilityType, minGuests)`); types `UtilityKpiBand`/`NewUtilityKpiBand`. Removes `utilityKpiTargets`, `UtilityKpiTarget`/`NewUtilityKpiTarget`.

- [ ] **Step 1: Generalize the bands table in `schema.ts`**

Replace the `electricityKpiBands` table + relations block (the `// Electricity KPI Bands` section) with:

```typescript
// ---------------------------------------------------------------------------
// Utility KPI Bands (guest-count step function, per property + utility)
// ---------------------------------------------------------------------------
export const utilityKpiBands = pgTable(
  'utility_kpi_bands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    minGuests: integer('min_guests').notNull(),
    targetUnits: numeric('target_units', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_kpi_bands_property_type_minguests_unique').on(
      table.propertyId,
      table.utilityType,
      table.minGuests
    ),
  ]
)

export const utilityKpiBandsRelations = relations(utilityKpiBands, ({ one }) => ({
  property: one(properties, {
    fields: [utilityKpiBands.propertyId],
    references: [properties.id],
  }),
}))
```

- [ ] **Step 2: Remove the flat-target table from `schema.ts`**

Delete the entire `// Utility KPI Targets (flat daily target — water in v1)` block: the `utilityKpiTargets` table and `utilityKpiTargetsRelations`.

- [ ] **Step 3: Update the inferred types**

Find and replace the type exports:
```typescript
export type ElectricityKpiBand = typeof electricityKpiBands.$inferSelect
export type NewElectricityKpiBand = typeof electricityKpiBands.$inferInsert
```
with:
```typescript
export type UtilityKpiBand = typeof utilityKpiBands.$inferSelect
export type NewUtilityKpiBand = typeof utilityKpiBands.$inferInsert
```
And **delete** the `UtilityKpiTarget`/`NewUtilityKpiTarget` type exports.

- [ ] **Step 4: Write the migration**

Create `drizzle/0016_utility_kpi_bands.sql`:

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='electricity_kpi_bands')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='utility_kpi_bands') THEN
    ALTER TABLE "electricity_kpi_bands" RENAME TO "utility_kpi_bands";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "utility_kpi_bands" ADD COLUMN IF NOT EXISTS "utility_type" "utility_type";--> statement-breakpoint
UPDATE "utility_kpi_bands" SET "utility_type"='electricity' WHERE "utility_type" IS NULL;--> statement-breakpoint
ALTER TABLE "utility_kpi_bands" ALTER COLUMN "utility_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "utility_kpi_bands" DROP CONSTRAINT IF EXISTS "electricity_kpi_bands_property_minguests_unique";--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='utility_kpi_bands_property_type_minguests_unique') THEN
    ALTER TABLE "utility_kpi_bands" ADD CONSTRAINT "utility_kpi_bands_property_type_minguests_unique" UNIQUE("property_id","utility_type","min_guests");
  END IF;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "utility_kpi_targets";--> statement-breakpoint
INSERT INTO "utility_kpi_bands" ("property_id","utility_type","min_guests","target_units") VALUES
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',0,7),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',1,10),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',6,10),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',11,11),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',16,11),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',21,11),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',26,4)
ON CONFLICT ("property_id","utility_type","min_guests") DO NOTHING;
```

- [ ] **Step 5: Apply in Supabase (manual)** — operator pastes Step 4 SQL into Supabase → SQL Editor → Run. If headless, note pending and continue.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0016_utility_kpi_bands.sql
git commit -m "feat(utilities): generalize electricity_kpi_bands -> utility_kpi_bands (+utility_type); drop flat target"
```

---

## Task 2: Query layer — utility-parameterized bands

**Files:**
- Modify: `src/lib/db/queries/utilities.ts`

**Interfaces:**
- Produces: `getKpiBands(propertyId, utilityType): Promise<UtilityKpiBand[]>`; `upsertKpiBands(propertyId, utilityType, bands: { minGuests: number; targetUnits: string }[]): Promise<UtilityKpiBand[]>`.
- Removes: `getElectricityBands`, `upsertElectricityBands`, `getWaterKpiTarget`, `upsertWaterKpiTarget`.

- [ ] **Step 1: Update the schema import**

In `src/lib/db/queries/utilities.ts`, in the import block from `../schema`: replace `electricityKpiBands,` with `utilityKpiBands,` and **remove** `utilityKpiTargets,`.

- [ ] **Step 2: Replace the bands query functions**

Replace `getElectricityBands` + `upsertElectricityBands` with:

```typescript
export async function getKpiBands(propertyId: string, utilityType: 'water' | 'electricity') {
  return db
    .select()
    .from(utilityKpiBands)
    .where(and(eq(utilityKpiBands.propertyId, propertyId), eq(utilityKpiBands.utilityType, utilityType)))
    .orderBy(asc(utilityKpiBands.minGuests))
}

/** Replace all KPI bands for a property + utility (delete + insert in a tx). */
export async function upsertKpiBands(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  bands: { minGuests: number; targetUnits: string }[]
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(utilityKpiBands)
      .where(and(eq(utilityKpiBands.propertyId, propertyId), eq(utilityKpiBands.utilityType, utilityType)))

    if (bands.length > 0) {
      return tx
        .insert(utilityKpiBands)
        .values(bands.map((b) => ({ propertyId, utilityType, minGuests: b.minGuests, targetUnits: b.targetUnits })))
        .returning()
    }
    return []
  })
}
```

- [ ] **Step 3: Remove the flat-target functions**

Delete `getWaterKpiTarget` and `upsertWaterKpiTarget` (the `// Water KPI Target (flat)` section).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/utilities.ts
git commit -m "feat(utilities): getKpiBands/upsertKpiBands (per utility); remove flat water target"
```

---

## Task 3: API routes

**Files:**
- Modify: `src/app/api/utilities/kpi-bands/route.ts`
- Delete: `src/app/api/utilities/kpis/route.ts`

**Interfaces:**
- Consumes: `getKpiBands`, `upsertKpiBands` (Task 2).

- [ ] **Step 1: Parameterize the kpi-bands route by utilityType**

In `src/app/api/utilities/kpi-bands/route.ts`:

(a) Change the import to `import { getKpiBands, upsertKpiBands } from '@/lib/db/queries/utilities'`.

(b) Add `utilityType` to the PUT schema:
```typescript
const upsertBandsSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  bands: z
    .array(z.object({ minGuests: z.number().int().min(0), targetUnits: z.number().min(0) }))
    .min(1)
    .max(20),
})
```

(c) GET: read + validate `utilityType` and pass it:
```typescript
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType')
    if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
    if (utilityType !== 'water' && utilityType !== 'electricity') {
      return NextResponse.json({ error: 'Invalid utilityType' }, { status: 400 })
    }
    return NextResponse.json(await getKpiBands(propertyId, utilityType))
```
(Keep the admin-only guard above this, unchanged.)

(d) PUT: pass `utilityType` to the upsert. Replace the `upsertElectricityBands(parsed.data.propertyId, …)` call with:
```typescript
    const result = await upsertKpiBands(
      parsed.data.propertyId,
      parsed.data.utilityType,
      parsed.data.bands.map((b) => ({ minGuests: b.minGuests, targetUnits: String(b.targetUnits) }))
    )
```
(Keep the admin-only guard and the duplicate-`minGuests` validation unchanged.)

- [ ] **Step 2: Delete the flat-target route**

```bash
git rm src/app/api/utilities/kpis/route.ts
```
Then `grep -rn "api/utilities/kpis\b\|/kpis'" src/` and confirm nothing references it (the water form that called it is deleted in Task 5; verify no other caller).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(utilities): kpi-bands route per utilityType; remove flat-target route"
```

---

## Task 4: Summary route + org rollup — water uses bands

**Files:**
- Modify: `src/app/api/utilities/summary/route.ts`
- Modify: `src/lib/db/queries/dashboard.ts`

**Interfaces:**
- Consumes: `getKpiBands` (Task 2), `resolveBandTarget`, `computeKpiAchievement`.

- [ ] **Step 1: summary route — imports**

Replace the queries import lines `getElectricityBands,` and `getWaterKpiTarget,` with a single `getKpiBands,`.

- [ ] **Step 2: summary route — `buildDailyRows` uses bands for both utilities**

Change the `buildDailyRows` signature to drop `waterTarget` and use `bandInputs` for water:
- Remove the `waterTarget: number | null` parameter (it's the last param).
- In the WATER branch, replace `const target = waterTarget` usage. Concretely, the water row currently sets `target: waterTarget, achieved: total !== null && waterTarget !== null ? total <= waterTarget : null`. Replace with a per-day banded target:
```typescript
    const occ = occByDate.get(r.readingDate)
    const guestCount = occ ? occ.guestCount : null
    const target = resolveBandTarget(guestCount, bandInputs)
    return {
      date: r.readingDate, readingValue: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      day: null, peak: null, offPeak: null, total, pending: total === null,
      guestCount, staffCount: occ ? occ.staffCount : null,
      target, achieved: total !== null && target !== null ? total <= target : null,
      penalty: 'normal' as const,
    }
```
(`resolveBandTarget` is already imported.)

- [ ] **Step 3: summary route — fetch bands for the selected utility**

In the `Promise.all`, replace the two conditional band/target fetches:
```typescript
      utilityType === 'electricity' ? getElectricityBands(propertyId) : Promise.resolve([]),
      utilityType === 'water' ? getWaterKpiTarget(propertyId) : Promise.resolve(null),
```
with a single fetch (remove one array slot + its destructured name `waterTarget`):
```typescript
      getKpiBands(propertyId, utilityType),
```
Update the destructuring tuple to drop `waterTarget` (the slot that received the water-target promise). Remove `const waterTargetNum = …` and pass nothing extra to `buildDailyRows` (drop the `waterTargetNum` argument from both `buildDailyRows(...)` calls).

- [ ] **Step 4: summary route — kpi.configured**

Change the `configured` expression to `bands.length > 0` for both utilities:
```typescript
        ? { configured: bands.length > 0, pct: current.kpiPct, evaluatedDays: current.kpiEvaluatedDays, achievedDays: current.kpiAchievedDays }
```

- [ ] **Step 5: rollup — water uses bands**

In `src/lib/db/queries/dashboard.ts` `getOrgUtilityKpiRollup`:

(a) Imports: in the `../schema` import replace `electricityKpiBands` with `utilityKpiBands` and **remove** `utilityKpiTargets`.

(b) Replace the per-property fetch of `bands` (electricity) + `waterTarget` with two band fetches:
```typescript
      db.select().from(utilityKpiBands)
        .where(and(eq(utilityKpiBands.propertyId, p.id), eq(utilityKpiBands.utilityType, 'electricity')))
        .orderBy(asc(utilityKpiBands.minGuests)),
      db.select().from(utilityKpiBands)
        .where(and(eq(utilityKpiBands.propertyId, p.id), eq(utilityKpiBands.utilityType, 'water')))
        .orderBy(asc(utilityKpiBands.minGuests)),
```
Name the destructured results `bands` (electricity) and `waterBands`. (The electricity `bandInputs`/`elecAch` block is unchanged.)

(c) Replace the Water section (`const wTarget = …` through `waterAch`) with a banded version:
```typescript
    // Water — guest-count bands (first in-window day has no predecessor → excluded)
    const waterReadings = readings.filter((r) => r.utilityType === 'water')
    const waterBandInputs = waterBands.map((b) => ({ minGuests: b.minGuests, targetUnits: parseFloat(b.targetUnits) }))
    const waterAch = waterBands.length > 0
      ? computeKpiAchievement(
          waterReadings.map((r, i) => {
            const prev = i > 0 ? waterReadings[i - 1] : null
            const rawTotal = prev && prev.readingValue !== null && r.readingValue !== null
              ? parseFloat(r.readingValue) - parseFloat(prev.readingValue) : null
            const total = rawTotal !== null && rawTotal >= 0 ? rawTotal : null
            return { total, target: resolveBandTarget(occByDate.get(r.readingDate)?.guestCount ?? null, waterBandInputs) }
          })
        )
      : { pct: null, evaluatedDays: 0, achievedDays: 0 }
```
(`resolveBandTarget` is already imported in dashboard.ts.)

- [ ] **Step 6: Self-review + commit**

Confirm: no remaining `getElectricityBands`/`getWaterKpiTarget`/`utilityKpiTargets`/`waterTargetNum`/`wTarget` references in either file; water KPI now banded in both summary + rollup; admin-strip unchanged.

```bash
git add src/app/api/utilities/summary/route.ts src/lib/db/queries/dashboard.ts
git commit -m "feat(utilities): water KPI via guest-count bands in summary + rollup"
```

---

## Task 5: UI — generalize the bands form; both utilities use it

**Files:**
- Modify: `src/components/admin/utility-kpi-bands-form.tsx`
- Modify: `src/components/admin/utilities-page-client.tsx`
- Delete: `src/components/admin/utility-water-kpi-form.tsx`

**Interfaces:**
- Consumes: the `utilityType`-aware `/api/utilities/kpi-bands` (Task 3).

- [ ] **Step 1: Add `utilityType` to the bands form**

In `src/components/admin/utility-kpi-bands-form.tsx`:

(a) Props — add `utilityType`:
```typescript
interface KpiBandsFormProps {
  propertyId: string
  utilityType: 'water' | 'electricity'
  onRefresh: () => void
}
```
Destructure it: `export function UtilityKpiBandsForm({ propertyId, utilityType, onRefresh }: KpiBandsFormProps) {`.

(b) Defaults keyed by utility — replace the single `DEFAULT_BANDS` const with:
```typescript
const DEFAULT_BANDS_BY_UTILITY: Record<'water' | 'electricity', Band[]> = {
  electricity: [
    { minGuests: 0, targetUnits: 224 }, { minGuests: 1, targetUnits: 305 }, { minGuests: 6, targetUnits: 331 },
    { minGuests: 11, targetUnits: 390 }, { minGuests: 16, targetUnits: 434 }, { minGuests: 21, targetUnits: 483 },
    { minGuests: 26, targetUnits: 501 },
  ],
  water: [
    { minGuests: 0, targetUnits: 7 }, { minGuests: 1, targetUnits: 10 }, { minGuests: 6, targetUnits: 10 },
    { minGuests: 11, targetUnits: 11 }, { minGuests: 16, targetUnits: 11 }, { minGuests: 21, targetUnits: 11 },
    { minGuests: 26, targetUnits: 4 },
  ],
}
```
In `openEdit` (where it does `setEditBands(bands.length > 0 ? [...bands] : [...DEFAULT_BANDS])`), use `DEFAULT_BANDS_BY_UTILITY[utilityType]`.

(c) Unit + labels — add near the top of the component body:
```typescript
  const unit = utilityType === 'water' ? 'm³' : 'kWh'
  const label = utilityType === 'water' ? 'Water' : 'Electricity'
```
Replace the hardcoded "Electricity KPI Bands (kWh by guest count)" card title with `` `${label} KPI Bands (${unit} by guest count)` ``, the table header "Daily target (kWh)" with `` `Daily target (${unit})` ``, the dialog title "Edit Electricity KPI Bands" with `` `Edit ${label} KPI Bands` ``, and the dialog input label "Target (kWh)" with `` `Target (${unit})` ``.

(d) Fetch + save — include `utilityType`:
- `fetchBands`: `fetch(\`/api/utilities/kpi-bands?propertyId=${propertyId}&utilityType=${utilityType}\`)`.
- `handleSave` body: `JSON.stringify({ propertyId, utilityType, bands: sorted })`.
Add `utilityType` to the `useEffect` deps that calls `fetchBands` (`[propertyId, utilityType]`).

- [ ] **Step 2: Page client — render the bands form for both utilities**

In `src/components/admin/utilities-page-client.tsx`:
- Remove `import { UtilityWaterKpiForm } from '@/components/admin/utility-water-kpi-form'`.
- In the admin config block (the `utilityType === 'electricity' ? (…) : (…)` ternary), change it so the bands form renders for both, electricity additionally getting slot config:
```tsx
      {isAdmin && (
        <div className="space-y-6">
          <UtilityTierForm propertyId={property.id} utilityType={utilityType} onRefresh={fetchData} />
          <UtilityKpiBandsForm propertyId={property.id} utilityType={utilityType} onRefresh={fetchData} />
          {utilityType === 'electricity' && (
            <UtilitySlotConfigForm onRefresh={() => {
              fetch('/api/utilities/slot-config')
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => d && setSlotTimes(d))
                .catch(() => {})
            }} />
          )}
        </div>
      )}
```
(Keep the existing `UtilityTierForm` placement; just ensure `UtilityKpiBandsForm` now always renders with `utilityType`, and `UtilityWaterKpiForm` is gone.)

- [ ] **Step 3: Delete the water flat-target form**

```bash
git rm src/components/admin/utility-water-kpi-form.tsx
```
Then `grep -rn "utility-water-kpi-form\|UtilityWaterKpiForm" src/` → must be empty.

- [ ] **Step 4: Self-review + commit**

Confirm: bands form takes `utilityType` (defaults/units/api all keyed by it); page client renders it for both utilities; water form deleted with no dangling imports.

```bash
git add -A
git commit -m "feat(utilities): water uses the KPI bands form (utilityType-aware); remove flat water form"
```

---

## Task 6: Final verification

- [ ] **Step 1: Consistency greps**
- `grep -rn "electricityKpiBands\|getElectricityBands\|upsertElectricityBands\|utilityKpiTargets\|getWaterKpiTarget\|upsertWaterKpiTarget\|utility-water-kpi-form\|UtilityWaterKpiForm\|api/utilities/kpis" src/` → **empty** (all generalized/removed).
- `grep -rn "getKpiBands\|upsertKpiBands\|utilityKpiBands" src/` → present in queries, route, summary, rollup.
- `grep -rn "utilityType" src/components/admin/utility-kpi-bands-form.tsx` → present (prop + api + defaults).

- [ ] **Step 2: Migration applied** — confirm the operator ran `drizzle/0016_utility_kpi_bands.sql` in Supabase (renames table, drops `utility_kpi_targets`, seeds TLH water bands). The deployed code reads `utility_kpi_bands` and will 500 on KPI reads until applied.

- [ ] **Step 3: Manual smoke (operator / dev server)**
1. TLH water tab (admin): "Water KPI Bands (m³ by guest count)" config shows the seeded 7 bands; KPI Achieved tile populates.
2. Electricity tab still shows its bands (m³→kWh label correct) + slot config; values unchanged.
3. Non-admin: no KPI bands form, no KPI numbers (unchanged).
4. Editing water bands saves and recomputes the water KPI %.

- [ ] **Step 4: Finish** — refresh MEMORY pointer; use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes

- **Spec coverage:** generalize table + drop flat (T1); query rename (T2); route param + delete kpis (T3); water-via-bands in summary + rollup (T4); form utilityType + page client + delete water form (T5); seed folded into the 0016 migration (T1 Step 4); ops note (T6). All spec sections mapped.
- **Type consistency:** `utilityKpiBands`/`UtilityKpiBand` (T1) used in T2/T4; `getKpiBands(propertyId, utilityType)`/`upsertKpiBands(propertyId, utilityType, bands)` (T2) consumed by T3/T4; the bands form's `utilityType` prop (T5) matches the route's `utilityType` (T3). `buildDailyRows` loses its `waterTarget` param (T4) — both call sites updated in the same task.
- **Acceptable edges:** water KPI needs a recorded guest count per day to resolve a band (days without occupancy are excluded — same as electricity); the rollup's first-in-window water day stays excluded (pre-existing, documented).
