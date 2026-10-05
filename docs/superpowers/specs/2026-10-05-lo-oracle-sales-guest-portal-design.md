# LO Oracle data, Sales & Marketing, and guest portal

Date: 2026-10-05
Status: Approved by the user on 2026-10-05; product implementation has not started.
Target branch: `taru-release` in the existing `.worktrees/taru-release` checkout.

## Intent and confirmed decisions

Implement Oracle hotel `LO` on the Taru release branch for two purposes:

1. A separate Sales & Marketing area showing future bookings by month.
2. A full guest portal including menus, excursions, and guest requests.

The user selected **room nights split by stay month**, rather than counting a booking only in its arrival month. Oracle remains read-only, preserving the earlier explicit restriction. Application writes persist imported data, questionnaires, and guest requests inside Taru only.

Guest access is confirmed: one private booking link opens the entire portal, and staff share it manually initially. The user also requests automatic guest email containing this same link. Include that delivery capability in the implementation, with manual delivery remaining available and automatic sending disabled during the initial manual rollout. The user confirmed the trigger: seven days before arrival, or immediately after import for an eligible last-minute booking.

## Evidence and reusable work

Live read-only probes in this chat authenticated to UAT and production and accepted `LO`. Production returned upcoming reservations, an in-house reservation, full reservation details, and a guest profile. Populated sample fields included names, email, phone, stay dates, room type/number, reservation status, language, nationality, and VIP information. Field population varies between guests. UAT returned no arrivals for the tested date window; this does not prove UAT has no reservations.

Existing code includes:

- `src/lib/oracle/{client,reservations,sync,types}.ts`.
- A guest-profile table, unique property/reservation identity, random tokens, and manual/cron sync routes.
- Staff guest-profile pages and per-property Oracle hotel-ID settings.
- Pre-arrival question/answer tables, but no questionnaire builder, guest form, or staff review implementation.
- Property menu and excursion catalogues and public presentation components.
- A Resend HTTP email transport and durable notification delivery/retry pattern under `src/lib/tasks/`; reuse the provider conventions, with a separate guest-delivery queue and configuration.

The current Oracle client uses the obsolete-for-this-environment password grant, omits the hotel authorization header, and reads different response envelopes from the verified production payloads. The sync does not paginate and only refreshes profiles in `pending_checkin`. Its write-back function is a stub and must be disabled for this release.

The release currently enables `dashboard,tasks,fleet,daily-records`. Guest profiles, menus, and excursions are blocked by the deployment policy. There is no Sales & Marketing module or reservation-specific guest portal.

## Approach

**Recommended: one normalized local reservation store, consumed by both areas.** Extend the existing guest-profile foundation, keeping Oracle reservation status separate from questionnaire/review state. Synchronization is the only component accessing Oracle; report and guest pages read validated local records. A successful sync timestamp and coverage window make freshness and completeness visible.

Alternative: have each page fetch directly from Oracle. This reduces local persistence but makes page latency, token handling, outages, and repeated API calls part of every guest/report visit. It also gives the two consumers inconsistent snapshots. Do not select this approach for the first release.

Deliver the common data layer first, monthly reporting second, and the guest portal/request workflow third. These are separate implementation milestones within the same approved release scope, each with its own implementation plan.

## 1. Read-only LO connection and reservation synchronization

- Use client-credentials OAuth, enterprise `TVPL`, the supplied scope, and `x-hotelid: LO` on property API requests. Cache tokens per environment/configuration and retry an expired token once.
- Keep secrets server-side in ignored local configuration and deployment secrets. Examples and tests contain names/placeholders only. Production and UAT must not share a reservation namespace; the release imports production data only, and UAT verification uses an isolated test dataset.
- Enforce a transport boundary allowing GET for Oracle property data and POST only for OAuth tokens. Disable Oracle reservation writes, including the existing `postPreArrival` stub. Keep `recentlyAccessed=false` on reservation searches.
- Parse the verified list envelope `reservations.reservationInfo` and detail envelope `reservations.reservation[]`. Select reservation and confirmation identifiers by their typed IDs rather than array position. Distinguish malformed responses from genuinely empty results.
- Page through complete bounded searches with explicit safety limits, timeout handling, and resumable coverage. Fetch future arrivals plus current in-house stays so nights from bookings that started earlier are included.
- Refresh known active reservations directly when necessary to detect cancellations or date changes outside the current search window. Do not infer cancellation from a missing search result or mark incomplete pages as a completed snapshot.
- Save normalized fields needed by the consumers: IDs, dates, room quantities/types/assignment, raw reservation status, guest identity/contact fields, and supported source/channel metadata. Avoid storing full Oracle response bodies.
- Preserve questionnaire answers and portal identity when refreshing reservation fields. Handle check-in, cancellation, no-show, checkout, and changed departure dates independently of questionnaire completion.
- Validate Oracle's LO property name against the intended local property before setting the mapping; do not infer the mapping solely from its initials.
- Provide an authorized manual refresh and an hourly-capable protected sync endpoint. The implementation/runbook will document scheduler setup and will not silently create external recurring jobs.
- Record last attempt, last complete success, covered dates, and safe errors. Retain the last complete reporting snapshot when a refresh fails.

## 2. Sales & Marketing

Add a distinct navigation area and route, proposed as `/sales-marketing`, scoped to LO initially and to the viewer's organization/property access.

Proposed initial access follows existing roles: admins and property managers with access to LO. Adding a dedicated marketing role is outside this first design and can be requested separately.

The default view is today through the end of the twelfth displayed calendar month in Asia/Colombo. The current month's bucket is explicitly labeled as remaining nights; later buckets cover full months. A month range selector supports a different future window.

Show a monthly room-night chart/table, a total future room-night figure, and a separate count of reservations contributing nights in each month. That reservation count is not additive across months when a stay crosses a boundary. Provide a reservation drill-down with dates, room type, source/channel where available, and status; keep guest contact details and portal tokens out of marketing responses.

Night attribution uses the intersection of `[arrival, departure)` with the reporting window and month boundaries, multiplied by verified reserved room quantity. Checkout day contributes no night. Include active booked/in-house inventory; exclude cancellation, no-show, waitlist, non-room/pseudo-room records, and checked-out stays from future totals. Deduplicate reservation IDs. Shared-room reservations require a verified rule that avoids counting the same inventory twice; test this explicitly before presenting totals as booked room nights. Missing or ambiguous room quantities are shown as a data-quality limitation rather than silently assumed.

Example: one room arriving 30 October and departing 2 November contributes two October nights and one November night.

Display last successful refresh, covered reporting dates, and incomplete/stale/error states. Revenue and occupancy percentages require additional validated daily rates/capacity inputs and are not promised by this version.

## 3. Guest portal

Proposed routes use a booking-specific public namespace such as `/stay/[token]`, separate from the authenticated staff portal and the existing property survey links.

Guest-facing sections:

- Welcome and stay details: property, arrival/departure, room type, and assigned room when available.
- Pre-arrival questionnaire: property-configured questions, submission acknowledgement, and staff review inside Taru.
- Dining: existing active LO set and a la carte menus, with dining requests tied to the booking.
- Experiences: existing active LO excursions, with preferred date, party size, and booking request submission.
- Guest services: free-text service requests and a history of that guest's requests and public status/replies.

Reuse existing catalogue data, images, prices-as-displayed, and presentation patterns. Empty catalogues have an honest unavailable state. A request is confirmed by staff, not automatically guaranteed by submission. Checkout, cancelled, and no-show bookings cannot submit new requests. Future guests may submit pre-arrival/dining/experience requests; in-stay service actions depend on the reservation's actual stay state.

Private links have high-entropy secrets, server-side lookup, explicit issuance/revocation, and expiry linked to the reservation's departure. Requests and pages derive organization/property/reservation scope from that credential; they never trust a client-supplied guest or property ID. Store a token hash for public lookup. Because staff sharing and automatic delivery need the same URL, keep its recoverable bearer secret encrypted server-side with a dedicated deployment secret; never persist it as plaintext in logs or delivery metadata. Only authorized staff and the guest email worker may recover it. Repeated synchronization/delivery does not rotate the link; an explicit revoke/regenerate action changes the link version and invalidates pending delivery of the old version. Guest pages/API responses are not publicly cached; guest responses expose only the fields needed for that stay. No internal notes, contact lists, financial balances, or raw Oracle payloads are exposed.

Automatic portal-link email is included below. SMS, payment processing, Oracle charges, check-in operations, and KOT integrations require separate scope. The first portal uses local requests reviewed by staff, preserving the Oracle read-only requirement.

## 4. Staff guest-request workflow

Add a property-scoped request inbox alongside Guest Profiles, with booking/guest context, requested service/catalogue item, preferred time, party size or quantities as applicable, submitted notes, and public status.

Admins and assigned property managers handle the initial inbox. Guests see only a safe public response and a simple state progression: received, in progress, completed, or declined. Staff-only notes remain separate. Store a request's item/title/displayed-price snapshot so catalogue edits do not rewrite its history.

Use transactional local writes, submission idempotency, bounded text/quantity validation, and per-token request limits. Request status changes are audited with the acting staff member. A dedicated guest-request table/inbox is the initial workflow; do not bypass the newer Task Manager's audited command model by directly inserting guest-origin tasks.

## 5. Automatic guest email

One transactional welcome/pre-arrival email presents the property, stay dates, and a single **Open your guest portal** link. Describe the portal's pre-arrival form, menus, excursions, and guest requests in the message; do not send separate credentials or links for each feature. Provide HTML and plain-text versions, following existing Taru branding and Resend transport conventions. This is a service email for the booking, not a marketing campaign.

The confirmed timing is seven days before arrival, with immediate eligibility for a newly imported booking inside that window. Calculate the due date in Asia/Colombo; process eligible jobs promptly after sync and through the protected worker. This provides immediate delivery eligibility after discovery, rather than claiming a push notification at Oracle booking creation. Already checked-in guests are not eligible for this pre-arrival email. At initial enablement, reconcile the current LO import, show the eligible recipients/count to staff, and activate sending prospectively at a recorded enablement time; existing imported bookings require an explicit reviewed catch-up action rather than a bulk send caused by deployment.

Use dedicated guest email enablement, sender, canonical HTTPS portal origin, and link-encryption configuration. Do not reuse `TASK_EMAIL_ENABLED` or send guests the Task Manager's internal URL. Missing email-provider configuration keeps manual sharing available and shows a setup-needed state to staff; missing link-encryption configuration blocks issuance until configured. The verified sender/domain and live email-provider credentials are deployment inputs to check before activation.

Queue each booking/link-version/message kind once. Use database leases, bounded retries, provider idempotency keys, and an explicit reconciliation state when an uncertain outcome outlives the provider's idempotency window. A successful Oracle sync can make a booking eligible, but importing or refreshing the same booking cannot produce repeated welcome emails. Record queued/provider-accepted/failed/skipped states, attempt times, and safe errors for staff; provider acceptance is not proof of inbox delivery.

Before sending, revalidate the booking's property scope, latest successful sync freshness, current primary guest email, active reservation, email schedule, portal expiry, and link version. Missing/invalid addresses, cancelled/no-show/checked-out bookings, revoked links, or stale reservation data are skipped or held with an actionable staff state. Rescheduled arrivals move pending delivery; successful delivery is not repeated automatically after a minor reservation change. Staff may intentionally resend with an audited action.

Tests use a fake provider or an explicitly configured internal test recipient. Do not email real guests during implementation, fixture tests, or preview verification. Oracle API access remains read-only throughout; the email side effect belongs solely to Taru's configured guest-delivery worker.

## Release integration and schema

Reuse the clean `taru-release` checkout. Keep its deployment profile and existing modules. Add explicit route/API module mappings for Sales & Marketing and the guest portal; enable Guest Profiles and the catalogue management needed for LO. Preserve gates on unrelated modules.

Use additive migrations for reservation extensions, sync metadata, portal access, guest requests, and guest email deliveries/activation state. Keep Drizzle schema, relations, org/property foreign keys, and indexes aligned with those migrations. Inspect existing migration history before allocating a migration filename. The shared database requires an explicit rollout order: migration before code that reads added columns; do not apply a migration during the design review.

## Validation and acceptance

- Synthetic fixtures reflecting verified Oracle envelopes; no real guest data or credentials in tests.
- Auth/header tests, token expiry/config isolation, GET-only transport enforcement, pagination, empty/malformed responses, failures, and cancellation/date-change reconciliation.
- Room-night tests for month/year boundaries, leap years, multi-room bookings, checkout exclusion, current in-house stays, cancellations, shared-room deduplication, and incomplete snapshots.
- Organization/property access tests for staff/report endpoints; guest token expiry/revocation, cross-booking isolation, inactive catalogues, submission idempotency, and request-state permissions.
- Email scheduling, last-minute bookings, arrival-date changes, missing addresses, cancelled/revoked/stale bookings, enablement without bulk backfill, repeated syncs, retries, provider idempotency, encrypted link recovery, and manual/automatic link consistency. No test sends to a real guest.
- TypeScript, focused Vitest suites, lint for changed code, and a production build with the Taru profile. Verify unrelated disabled routes remain blocked.
- Browser verification of the monthly view, mobile guest flows, questionnaire submission, request creation/history, staff handling, and empty/error states using isolated fixtures.
- Bounded live production GET verification of the finished Oracle client, without logging guest identities. Application smoke tests that write requests/answers use isolated test data.

Release acceptance: LO reports reflect complete synchronized bookings, room nights follow the chosen month rule, a private guest link exposes only its own booking and all portal features, guests can browse LO catalogues and submit local requests, staff can process those requests, configured automatic email queues the same portal link once at the agreed time, manual sharing works independently, and Oracle property requests remain GET-only.

## Review assumptions

Manual private-link access initially, automatic portal-link email capability, and seven-day/last-minute timing are confirmed. The approved defaults are the next 12 calendar buckets, admins/assigned property managers for internal access, and staff-confirmed dining/experience requests. These are approved design decisions, not completed implementation.

## Sources

- Oracle client-credentials migration guidance: https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/t_migrating_to_client_credentials_based_authentication_scheme_ocim.htm
- Oracle reservation API specification: https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/rsv.json
- Existing approved pre-arrival scope: `2026-06-26-oracle-guest-profiles-prearrival-design.md`; this proposal supersedes its Oracle write-back behavior for the read-only LO release.
- Release workflow: `docs/runbooks/taru-vercel-release.md`.
