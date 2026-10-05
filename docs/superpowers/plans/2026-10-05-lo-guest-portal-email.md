# LO Guest Portal and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each LO booking one private portal for stay details, pre-arrival, dining, excursions and guest requests, with staff sharing initially and reliable automatic email seven days before arrival or after last-minute import.

**Architecture:** The guest credential resolves one canonical booking from the completed foundation plan. Reuse active property catalogues; questionnaires and service requests persist inside Taru with a staff inbox. A separate durable email outbox sends the same encrypted/recoverable private link through the existing Resend provider conventions.

**Tech Stack:** Existing Next.js, TypeScript, Drizzle/PostgreSQL, Zod v4, Supabase private Storage, Node crypto, shadcn/ui, Resend HTTP API, Vitest. No added packages.

**Spec:** `docs/superpowers/specs/2026-10-05-lo-oracle-sales-guest-portal-design.md`.

## Global Constraints

- Execute after the Oracle foundation and Sales & Marketing plans in `.worktrees/taru-release`.
- Oracle property requests remain GET-only. Guest/staff submissions write only Taru data and private guest uploads.
- One link opens every guest feature. Manual sharing works independently of email provider configuration.
- Automatic delivery begins disabled; enablement is prospective, with an explicit reviewed catch-up action for existing imports.
- Seven-day eligibility uses the Asia/Colombo date; last-minute means discovered by a successful import inside that window.
- Active admins/assigned PMs handle the initial staff inbox; guest access derives its org/property/booking from the token.
- No real guest mail during implementation, isolated fixture verification, or preview. Do not expose internal notes, financial balances, raw Oracle payloads, or bearer secrets in logs.
- Missing link encryption configuration blocks link issuance with a clear setup state; missing email configuration does not block manual link issuance.

## Review Focus

- A changed departure or cancelled source booking invalidates the correct guest actions without deleting questionnaire/request history (Tasks 1 and 4).
- Tampered/revoked/cross-booking credentials never reveal another guest's data or files (Tasks 1 and 3).
- A catalogue changes after submission: request history retains the submitted item/price snapshot, and inactive items reject new requests (Task 4).
- A provider accepts an email and the database write fails: retry uses identical encrypted content and idempotency key, or reconciliation after the provider window (Task 6).
- An old imported backlog or changed primary guest email never produces an unreviewed bulk send (Task 6).

## Shared contracts and file boundaries

Create `src/lib/guest-portal/types.ts` with these public/internal contracts before writing consumers:

```ts
interface GuestScope {
  accessId: string; guestProfileId: string; orgId: string; propertyId: string
  version: number; stayState: import('@/lib/oracle/types').StayState
  arrivalDate: string; departureDate: string; expiresAt: string
  fresh: boolean
}
interface PublicGuestRequest {
  id: string; kind: 'dining' | 'excursion' | 'service'
  title: string; notes: string; requestedDate: string | null; requestedTime: string | null
  partySize: number | null; quantity: number | null; priceNote: string | null
  state: 'received' | 'in_progress' | 'completed' | 'declined'
  publicReply: string | null; createdAt: string
}
interface GuestRequestInput {
  submissionId: string; kind: PublicGuestRequest['kind']; itemId?: string
  itemKind?: 'menu_item' | 'set_menu' | 'excursion'
  notes: string; requestedDate?: string; requestedTime?: string
  partySize?: number; quantity?: number
}
interface StaffGuestRequest extends PublicGuestRequest {
  guestProfileId: string; guestName: string | null; roomNumber: string | null
  internalNote: string | null; version: number
}
interface PublicQuestion {
  id: string; prompt: string; type: 'short_text' | 'long_text' | 'single_choice' |
    'multi_choice' | 'date' | 'time' | 'yes_no' | 'file'
  options: string[]; required: boolean
}
interface QuestionnaireInput {
  submissionId: string; answers: { questionId: string; text?: string; options?: string[]; uploadId?: string }[]
}
```

`access.ts` owns token resolution and crypto; `queries.ts` owns safe guest reads; `questionnaires.ts` owns question/answer validation; `requests.ts` owns guest-request transitions; `email.ts` owns provider calls; `email-worker.ts` owns durable scheduling/delivery. Server routes consume these units rather than unrestricted table rows.

Define `GuestInputError extends Error` with a numeric `status` in `types.ts`, and safe public error-response mapping reused by the guest routes. Named mock/fixture helpers in test snippets are test-local builders of the listed contracts, not production exports.

### Task 1: Portal persistence, link lifecycle, and credential isolation

**Files:** Create `src/lib/guest-portal/{types,access}.ts`, `src/lib/guest-portal/access.test.ts`, `drizzle/0038_lo_guest_portal.sql`; modify `src/lib/db/schema.ts`, `src/lib/db/queries/oracle-sync.ts`; create staff link route `src/app/api/guest-profiles/[id]/link/route.ts`.

**Interfaces:** Produce `issueGuestLink(guestProfileId: string): Promise<{ url: string; version: number; expiresAt: string }>`, `revokeGuestLink(guestProfileId: string): Promise<void>`, `resolveGuestScope(token: string): Promise<GuestScope>`, and server-only `recoverGuestLink(accessId: string): Promise<string>`. Staff methods internally call foundation's `requireLoPropertyAccess` after an org-scoped profile lookup. Resolve raises a uniform safe 404 for invalid/expired/revoked/foreign credentials.

- [ ] **Step 1: Add failing tests for random link uniqueness, hash lookup, encryption tamper, shared manual/email URL, cancelled/expired source, changed departure, foreign-org staff and token version revocation.** Dependency seams use `vi.mock`; crypto tests use a synthetic 32-byte test key.

```ts
it('manual sharing and automatic delivery use the same URL', async () => {
  const link = await issueGuestLink('synthetic-profile')
  expect(await recoverGuestLink('synthetic-access')).toBe(link.url)
})
it('rejects a cancelled booking', async () => {
  mockSource({ stayState: 'cancelled' })
  await expect(resolveGuestScope('synthetic-token')).rejects.toMatchObject({ status: 404 })
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/guest-portal/access.test.ts`; expect missing exports/failures.
- [ ] **Step 3: Implement schema and AES-GCM/hash lifecycle.** Create `guest_portal_access` (org/property/profile FKs, unique active booking access, token_hash unique, encrypted_token, version, expiry, revoked_at, issued_by, timestamps); use random 32-byte base64url tokens, SHA-256 lookup, AES-256-GCM with a fresh IV and authentication tag. Key is `GUEST_PORTAL_LINK_KEY`, base64 encoding exactly 32 bytes. Encrypt with access ID/version as authenticated context. Reuse the existing active URL until explicit regeneration; issuance locks the booking/access row to avoid races.

```ts
const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', key, iv)
cipher.setAAD(Buffer.from(`${accessId}:${version}`))
```

The canonical origin is `GUEST_PORTAL_ORIGIN` and must be HTTPS except loopback development. Expiry is end of departure date in Colombo; the publishing transaction updates active access expiry when departure changes. Resolve reads current canonical state every time; stale source data older than 24 hours permits a safe read state but disables request submission/email until refreshed. Cancelled/no-show/checked-out sources reject new actions. The legacy `guest_profiles.token` must not grant the new portal by itself.

The same migration creates `guest_requests`, `guest_request_events`, `guest_email_settings`, `guest_email_deliveries`, `guest_portal_uploads`, and `pre_arrival_submissions`, plus questionnaire answer metadata specified in Tasks 3, 4 and 6. Include org/property/profile/access foreign keys, indexes and uniqueness constraints; validate cross-scope relationships server-side and with composite FKs where possible. Use `questionnaire_status` (`not_started`, `submitted`, `reviewed`) separately from source stay state; backfill existing pending-approval rows as submitted, others not_started. `pre_arrival_submissions` stores UUID identity, org/property/profile IDs, unique profile/client-submission UUID, submitted/reviewed times and reviewer; add answer `submission_id`, `upload_id`, `type_snapshot`, and `options_snapshot` columns. `guest_portal_uploads` records UUID identity, org/property/profile/access ownership, private object path, verified MIME, byte size and cleanup state. These definitions are included in this migration once, not in later duplicate migrations.
- [ ] **Step 4:** Run tests/TypeScript and apply the migration twice to an isolated database; verify encryption key absence fails issuance without impacting staff reporting.
- [ ] **Step 5:** Commit as `feat(guest-portal): add private booking access and persistence`.

### Task 2: Safe guest homepage and existing catalogue presentation

**Files:** Create `src/lib/guest-portal/queries.ts`, `src/lib/guest-portal/queries.test.ts`, `src/app/(guest)/layout.tsx`, `src/app/(guest)/stay/[token]/page.tsx`, `src/components/guest-portal/{guest-home,guest-menu,guest-excursions}.tsx`; modify `src/middleware.ts`, `next.config.ts`. Read existing menu/excursion components before composition.

**Interfaces:** Produce `getGuestPortalView(token: string)` returning only `{ stay: { guestName: string | null; arrivalDate: string; departureDate: string; roomType: string | null; roomNumber: string | null; stayState: string; fresh: boolean }; property: { name: string; imageUrl: string | null; location: string | null }; menus: MenuWithCategories[]; excursions: Excursion[]; questions: PublicQuestion[]; questionnaireStatus: string; requests: PublicGuestRequest[] }`. Import catalogue types from their existing modules. The public read does not include access hashes/ciphertext, contact lists, guest email/phone, postedBy, or internal staff notes.

- [ ] **Step 1: Add failing projection/isolation tests.** Include a booking at property A with property B's catalogue fixture, no active catalogues, unassigned room, and stale sync banner.

```ts
it('excludes staff and financial fields from a guest response', async () => {
  const view = await getGuestPortalView('synthetic-token')
  const text = JSON.stringify(view)
  for (const privateValue of ['staff-note', 'secret-ciphertext', 'financial-balance']) expect(text).not.toContain(privateValue)
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/guest-portal/queries.test.ts`; expect failure/missing implementation.
- [ ] **Step 3: Implement scoped reads and responsive home navigation.** Call `resolveGuestScope`, fetch catalogues by the resolved property ID, filter active menu/categories/items/excursions, and select guest-safe fields explicitly. Home has Stay, Pre-arrival, Dining, Experiences, and Requests sections. Reuse `TraditionalMenuLayout` and excursion presentation, adding internal request actions instead of automatically navigating to third-party booking links. Preserve display-price text; do not calculate a checkout amount. Create a guest layout with Taru branding and accessible mobile navigation, avoiding the staff sidebar.

```tsx
export const dynamic = 'force-dynamic'
export default async function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getGuestPortalView(token)
  return <GuestHome view={view} token={token} />
}
```

Recognize `/stay/` and `/api/guest-portal/` as public only after module gates. Apply `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow` on guest pages/APIs so external images/links do not receive the bearer URL. Invalid links show one unavailable state; do not disclose which check failed. Current service worker already excludes portal data; keep that rule.
- [ ] **Step 4:** Run projection/access tests and browser checks at 390px/1440px with synthetic view data; test keyboard navigation, long names, empty catalogues, and invalid links.
- [ ] **Step 5:** Commit as `feat(guest-portal): add personalized stay and catalogue pages`.

### Task 3: Configurable pre-arrival questions and private attachments

**Files:** Create `src/lib/guest-portal/{questionnaires,uploads}.ts` and their `.test.ts` files; create `src/app/api/guest-profiles/questions/route.ts`, `src/app/api/guest-profiles/questions/[id]/route.ts`, `src/app/api/guest-profiles/[id]/review/route.ts`, `src/app/api/guest-portal/[token]/questionnaire/route.ts`, `src/app/api/guest-portal/[token]/uploads/route.ts`, `src/components/guest-portal/questionnaire-form.tsx`, `src/components/guest-profiles/question-builder.tsx`. Modify the staff guest-profile page/client to add Questions and review views.

**Interfaces:** Produce `submitQuestionnaire(scope: GuestScope, input: QuestionnaireInput): Promise<{ status: 'submitted' }>`, `reviewQuestionnaire(guestProfileId: string): Promise<void>`, `saveGuestUpload(scope: GuestScope, file: File): Promise<{ uploadId: string }>`, and `readGuestUpload(scope: GuestScope, uploadId: string): Promise<{ url: string; expiresIn: number }>`. Public POST/GET upload routes resolve their token before save/read; staff attachment reads authorize the property and use the same ownership-checked path. Staff review internally requires scoped active admin/PM. Only admins edit property questions; PMs can review assigned LO guests.

- [ ] **Step 1: Add failing tests for all eight answer types, required fields, changed question definitions, arbitrary option values, another guest's upload ID, duplicate submission, and staff review without Oracle calls.** Use actual choice definitions in fixtures.

```ts
it('rejects an option that is absent from the stored question', async () => {
  mockQuestion({ id: 'question-a', type: 'single_choice', options: ['Car', 'Train'], required: true })
  await expect(submitQuestionnaire(scope, { submissionId: 'submission-a', answers: [{ questionId: 'question-a', options: ['Plane'] }] })).rejects.toThrow()
})
```

- [ ] **Step 2:** Run both test files; expect missing validators and upload isolation failures.
- [ ] **Step 3: Implement builder, validation, submission/review transactions and uploads.** Builder creates/edits/deactivates/reorders stored questions; at most one active time question maps to ETA. Validate question IDs from current scoped active definitions, not client labels. Snapshot prompt/type/options with each answer and a unique booking/submission key so retries cannot duplicate. Text limits are 500 characters for short answers and 4000 for long answers; reject invalid calendar dates/times, boolean ambiguity, unlisted options, duplicates and missing required answers. Submission sets local questionnaire status; review stamps actor/time and sets reviewed, without Oracle write-back.

```ts
const chosen = new Set(answer.options ?? [])
if ([...chosen].some(option => !question.options.includes(option))) throw new GuestInputError('Choose a listed option', 400)
await tx.insert(preArrivalAnswers).values({ guestProfileId: scope.guestProfileId,
  questionId: question.id, promptSnapshot: question.prompt,
  valueText: answer.text ?? null, valueOptions: [...chosen] }).returning()
```

Uploads use private `pre-arrival` Storage, random server paths scoped by org/profile, a metadata owner row, 8 MiB maximum, and JPEG/PNG/PDF signatures validated against MIME. Bound the body before parsing multipart, reject unsupported content, and never accept a client file URL. Deleting/replacing drafts schedules private-object cleanup. Guests/staff obtain short-lived signed reads only after booking/property checks. Configure the private bucket in the rollout runbook; upload tests use a fake Storage adapter. Submitted forms show acknowledgement/read-only answers; staff see safe signed attachment links and a local Review action.
- [ ] **Step 4:** Run questionnaire/upload/access suites and an isolated submission transaction test; browser-check required choice/file handling and duplicate-submit behavior.
- [ ] **Step 5:** Commit as `feat(guest-portal): add pre-arrival forms and local review`.

### Task 4: Guest requests and staff handling

**Files:** Create `src/lib/guest-portal/requests.ts`, `src/lib/guest-portal/requests.test.ts`, `src/app/api/guest-portal/[token]/requests/route.ts`, `src/app/api/guest-profiles/requests/route.ts`, `src/app/api/guest-profiles/requests/[id]/route.ts`, `src/components/guest-portal/request-form.tsx`, `src/components/guest-profiles/request-inbox.tsx`; modify the guest homepage and staff guest-profile client.

**Interfaces:** Produce `submitGuestRequest(scope: GuestScope, input: GuestRequestInput): Promise<PublicGuestRequest>`, `getGuestRequests(scope: GuestScope): Promise<PublicGuestRequest[]>`, `getStaffGuestRequests(propertyId: string): Promise<StaffGuestRequest[]>`, and `updateGuestRequest(id: string, input: { version: number; state: PublicGuestRequest['state']; publicReply?: string; internalNote?: string }): Promise<void>`. Staff functions authorize active admin/assigned PM and organization scope internally.

- [ ] **Step 1: Write failing tests for item-property mismatch, inactive items, cancelled/checked-out/stale booking, future service requests, quantities, retry idempotency, changed prices and stale staff versions.** Requests include a guest-supplied UUID submission ID but never a guest/property ID.

```ts
it('retains the submitted catalogue price after editing', async () => {
  const request = await submitGuestRequest(scope, { submissionId: '00000000-0000-4000-8000-000000000001', kind: 'excursion', itemId: 'item-a', notes: '', partySize: 2 })
  mockExcursion({ id: 'item-a', price: 'Changed price' })
  expect((await getGuestRequests(scope)).find(r => r.id === request.id)?.priceNote).toBe(request.priceNote)
})
```

- [ ] **Step 2:** Run the request suite; expect missing transactional handlers to fail.
- [ ] **Step 3: Implement local request records and audited transitions.** `guest_requests` includes org/property/profile/access scope, submission ID, type, source item ID, title/price snapshot, notes, requested date/time, party/quantity, state, public reply, separate internal note, version and timestamps. Unique profile/submission protects retries; return the original row for an identical retry and 409 for reused ID with different content. Validate party size/quantity as integers 1–50, notes max 4000, reply max 2000, valid local dates within the stay for scheduled requests. Dining may reference active menu items or a set menu; validate item→category→menu→property ownership. Excursions validate property ownership. Future guests may request dining/experiences; in-stay service requires `in_house`. Limit new requests to 10 per access/hour using an atomic database check/lock, excluding idempotent retries.

```ts
if (!scope.fresh) throw new GuestInputError('Please contact the hotel while your stay is being refreshed', 409)
if (input.kind === 'service' && scope.stayState !== 'in_house') throw new GuestInputError('Service requests open during your stay', 409)
await tx.update(guestRequests).set({ state: input.state, version: current.version + 1, updatedAt: new Date() })
  .where(and(eq(guestRequests.id, id), eq(guestRequests.version, input.version))).returning()
```

Append an actor/state event in the same transaction. Received→in_progress/completed/declined and in_progress→completed/declined are allowed; terminal states remain terminal except an explicit audited staff correction. Guest history exposes public status/reply only. UI reports receipt without promising confirmation; staff inbox filters by property/state and displays guest context without returning tokens.
- [ ] **Step 4:** Run tests and isolated transaction/rate-limit contention checks. Browser-check dining, excursion and in-house service submission/history, public replies, and staff conflict refresh.
- [ ] **Step 5:** Commit as `feat(guest-portal): add guest requests and staff inbox`.

### Task 5: Branded guest email content and provider boundary

**Files:** Create `src/lib/guest-portal/email.ts`, `src/lib/guest-portal/email.test.ts`; extend `.env.oracle.example` with guest portal/email names.

**Interfaces:** Produce `renderGuestEmail(input: { propertyName: string; arrivalDate: string; departureDate: string; portalUrl: string }): { subject: string; html: string; text: string }` and `sendGuestEmail(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<{ providerId: string }>`. The worker is the only production caller of the sender.

- [ ] **Step 1: Write failing tests for one portal link, every feature described, HTML escaping, plain-text equivalent, missing configuration, bounded network timeout, and provider acknowledgement.** Use a `.test` recipient and mocked fetch.

```ts
it('uses one portal link for all guest features', () => {
  const email = renderGuestEmail({ propertyName: 'Synthetic LO', arrivalDate: '2026-10-12', departureDate: '2026-10-15', portalUrl: 'https://portal.example.test/stay/synthetic-token' })
  expect(email.html.match(/href=/g)).toHaveLength(1)
  expect(email.text).toContain('menus')
  expect(email.text).toContain('excursions')
})
```

- [ ] **Step 2:** Run the email suite; expect absent renderer/provider implementation to fail.
- [ ] **Step 3: Implement HTML/text welcome email and separate guest sender.** Reuse Resend HTTP conventions without changing Task Manager's queue or sender. Read `RESEND_API_KEY`, `GUEST_EMAIL_FROM`, `GUEST_PORTAL_ORIGIN`; send HTML and text with a stable `Idempotency-Key`, a 15-second timeout and safe provider status errors. Validate recipient and HTTPS portal origin. Do not log recipient, raw link, request body or provider response body. Provider ID means accepted, not delivered.

```ts
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST', signal: AbortSignal.timeout(15000),
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
  body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
})
```

Document `GUEST_PORTAL_LINK_KEY`, `GUEST_PORTAL_ORIGIN`, `GUEST_EMAIL_ENABLED` (default false), `GUEST_EMAIL_FROM`, `RESEND_API_KEY`; task-email settings remain separate.
- [ ] **Step 4:** Run mocked provider/content tests and inspect the email rendered to a temporary local HTML file. No actual send.
- [ ] **Step 5:** Commit as `feat(guest-portal): add branded portal welcome email`.

### Task 6: Prospective scheduling, durable delivery and retries

**Files:** Create `src/lib/guest-portal/email-worker.ts`, `src/lib/guest-portal/email-worker.test.ts`, `src/app/api/cron/guest-portal/route.ts`, `src/app/api/guest-profiles/email-settings/route.ts`, `src/app/api/guest-profiles/[id]/email/route.ts`; modify completed-sync API integration to enqueue eligibility after publication only.

**Interfaces:** Produce `guestEmailDueDate(arrivalDate: string): string`, `enqueueGuestEmails(now: Date): Promise<{ queued: number; held: number }>`, `deliverGuestEmails(options: { now: Date; limit: number; budgetMs: number }): Promise<{ accepted: number; held: number; failed: number }>`, `previewGuestEmailActivation(propertyId: string): Promise<{ eligible: number; missingEmail: number; excluded: number }>`, and `activateGuestEmails(propertyId: string, reviewedCount: number): Promise<void>`. Explicit catch-up and resend use the same scoped staff endpoint with an audited mode and confirmation of the current preview count.

Internal worker helpers are `holdDelivery(id: string, category: string): Promise<void>`, `recoverImmutableEmail(id: string): Promise<Parameters<typeof sendGuestEmail>[0]>`, and `markDeliveryAccepted(id: string, providerId: string): Promise<void>`. They are owned by `email-worker.ts` and used only after claiming/revalidating a scoped delivery. Bind a local `now: Date` from options before comparing job times.

- [ ] **Step 1: Write failing tests for seven-day and last-minute dates, date moves, already-in-house sources, disabled mail, stale sync, revoked links, missing/changed addresses, backlog exclusion, stable retry content, leases and the provider window.** Mock the provider at the module boundary.

```ts
expect(guestEmailDueDate('2026-10-12')).toBe('2026-10-05')
it('does not queue a deployment backlog automatically', async () => {
  mockActivation({ enabledAt: '2026-10-05T08:00:00+05:30' })
  mockBooking({ firstImportedAt: '2026-10-01T08:00:00+05:30' })
  expect((await enqueueGuestEmails(new Date('2026-10-05T09:00:00+05:30'))).queued).toBe(0)
})
```

- [ ] **Step 2:** Run the worker suite; expect failure/missing functions.
- [ ] **Step 3: Implement separate settings/outbox tables and worker.** `guest_email_settings` stores scoped enabledAt/actor and activation preview version. `guest_email_deliveries` stores booking/access/link version, unique message event key, kind, due date, state, attempts, availableAt, leaseUntil, startedAt, acceptedAt, provider ID, recipient hash, encrypted immutable provider-message payload and safe error category. Add `firstImportedAt` to canonical guest profiles for prospective activation; use the existing createdAt for preexisting imports. Use the portal encryption primitive with separate authenticated context for email payloads.

Eligibility requires production LO, successful recent sync, reserved stay, valid current primary email, due Colombo date reached and arrival not passed, active unexpired link, and first import after recorded activation. Creation is unique by booking/access-version/kind; ordinary re-sync never duplicates. Explicit resend adds an audited delivery event version; catch-up is separate and scoped.

Claim jobs with `FOR UPDATE SKIP LOCKED` and a two-minute lease. Recheck eligibility before every provider call. Before the first attempt, persist encrypted immutable content and recipient hash; retries decrypt exactly that content and reuse the same provider idempotency key. If recipient/link changed after an uncertain attempt, hold for staff reconciliation. If startedAt is older than 23 hours, hold rather than risking duplicate delivery beyond the provider window. Retry transient errors up to five attempts with bounded backoff; failures remain visible and manually reviewable. Provider-accepted state is distinct from confirmed inbox delivery.

```ts
if (job.startedAt && now.getTime() - Date.parse(job.startedAt) >= 23 * 3600000) {
  await holdDelivery(job.id, 'Provider outcome requires reconciliation')
  continue
}
const sent = await sendGuestEmail(await recoverImmutableEmail(job.id))
await markDeliveryAccepted(job.id, sent.providerId)
```

The protected worker uses constant-time `CRON_SECRET` checking and a 45-second budget. A completed manual/cron Oracle sync may enqueue eligible messages promptly; it does not send during page rendering. Cron resumes pending mail. Staff setup displays eligible counts, missing-address states, enablement status and delivery history; actual enablement requires both explicit activation and valid guest sender/config. No scheduler or real email is activated by committing code.
- [ ] **Step 4:** Run the worker suite and isolated database lease/idempotency checks. Simulate provider acceptance followed by persistence failure and verify exactly the same retry key/body. Verify preview mode cannot send to actual guest addresses.
- [ ] **Step 5:** Commit as `feat(guest-portal): schedule reliable pre-arrival link emails`.

### Task 7: Final release policy, browser acceptance and rollout evidence

**Files:** Modify module policy/mapping/tests, portal navigation/tests/header, `.env.production.example`, `docs/runbooks/taru-vercel-release.md`; create `docs/runbooks/lo-guest-portal.md`, `scripts/lo-guest-portal-acceptance.mjs`.

**Interfaces:** Final release modules are `dashboard,tasks,fleet,daily-records,guest-profiles,sales-marketing,guest-portal,menus,excursions`. All guest/staff/email APIs get explicit module mappings. Keep the existing development profile behavior and unrelated disabled modules.

- [ ] **Step 1: Add failing route-policy tests.** Cover `/stay/example`, `/api/guest-portal/example/requests`, guest file/questionnaire endpoints, staff inbox/email/link endpoints, catalogues and new cron; `/surveys`, `/sops`, `/rostering`, `/assets`, standalone utilities and near-prefix lookalikes remain under their existing rules.

```ts
expect(moduleForPath('/stay/example')).toBe('guest-portal')
expect(moduleForPath('/api/cron/guest-portal')).toBe('guest-portal')
expect(getClientModuleRequestStatus('/surveys', finalModules)).toBe(404)
```

- [ ] **Step 2:** Run release/module/navigation tests; expect missing mappings to fail.
- [ ] **Step 3: Integrate final policy and acceptance harness.** The harness accepts only loopback/isolated fixture origins, intercepts the email provider, and verifies complete mobile guest navigation, questionnaire/file flow, requests/history, staff responses, cancellation/expired links, catalogue changes, duplicate submissions, and mail setup/activation states. Existing catalogue management remains available to authorized staff. Add property-scoped authorization checks to reused catalogue APIs touched by this integration; admin role alone cannot bypass organization isolation.

```ts
const finalModules = 'dashboard,tasks,fleet,daily-records,guest-profiles,sales-marketing,guest-portal,menus,excursions'
```

The runbook records additive migration order, private bucket setup, verified sender/domain and server secrets, LO property mapping, Oracle import completeness, safe preview fixtures, manual-link acceptance, and prospective email activation/catch-up procedure. Keep automatic email disabled through preview; no live sends/deployment/migrations occur as a side effect of this plan.
- [ ] **Step 4:** Run focused suites, then `npm test`, changed-file lint, `npx tsc --noEmit`, `npm run build`, and the isolated browser harness. After those pass, perform one bounded Oracle GET smoke check with safe output. Obtain an independent whole-branch review following the user-selected execution workflow; do not treat tests alone as product acceptance.
- [ ] **Step 5:** Commit as `feat(guest-portal): complete LO portal release integration` and record remaining environment/deployment inputs. Do not push/deploy automatically.

## Overall completion criteria

All three plans' product flows must pass. The guest link opens every feature, the monthly room-night view follows the selected month rule, requests are handled locally, and automated email is implemented/tested but inactive until configured and explicitly enabled. Report exact tests, migration files, runtime setup still required, and whether any live verification was performed. Do not claim deployment or actual email delivery from a code/build result.
