# LO guest portal rollout

This branch implements The Long House (Oracle hotel `LO`) with Oracle **GET-only data access** plus the OAuth token POST. Questionnaires, guest requests and email records are local; nothing writes back to Oracle. No database migration, deployment, property mapping, scheduler or real email is activated by these commits.

## Database and property setup

1. Back up the target database and inspect its existing migration history. Apply the additive `drizzle/0037_lo_oracle_reservations.sql`, then `drizzle/0038_lo_guest_portal.sql`, after its existing baseline migrations. Both were applied twice successfully against disposable PostgreSQL. Do not regenerate the entire schema against the shared database.
2. In Supabase Storage create **private** bucket `pre-arrival`, maximum object size 8 MiB, allowed MIME types `image/jpeg`, `image/png`, `application/pdf`. Do not add public or anonymous storage policies. Server uploads check signatures; downloads require the current booking link or scoped staff authorization and expire after 60 seconds. Protect the service role key on the server.
3. Confirm the Oracle hotel-name response before mapping the same-org active property to hotel ID `LO`. The verified production response was **Taru Villas The Long House - Benota**; confirm the local property is The Long House. Do not map all properties to LO.
4. Configure production client credentials from `.env.oracle.example` as server secrets. Keep the fixed GET-only client, production environment, and the verified Singapore production gateway. Never put credentials in `NEXT_PUBLIC_*`, source files, screenshots or logs.
5. Generate a random 32-byte key and encode it as canonical base64 for `GUEST_PORTAL_LINK_KEY`. Keep it stable and backed up: losing/rotating it makes existing encrypted links and queued email payloads unrecoverable. Set `GUEST_PORTAL_ORIGIN` to the final HTTPS origin with no path/query. Links created on a preview origin must be revoked and reissued for the final origin.
6. Refresh LO bookings from Guest Profiles. Resume partial runs until **complete**, verify freshness and arrival coverage, and inspect Sales & Marketing room-night quality warnings. A partial import retains the previous complete snapshot. Room nights multiply only verified quantities and split by stay month, excluding departure day.

## Manual guest acceptance

Authorized active admins and assigned property managers can issue/reuse private links from Guest Profiles. Regenerate explicitly revokes the former link. Share only with that reservation's guests. A link expires at the end of its departure date in Colombo and becomes unavailable after cancellation, no-show or checkout. Re-import preserves the link and questionnaire history.

Configure property-specific pre-arrival questions (admin), menus and excursions. The portal offers stay details, all eight question types, private files, dining and excursion requests, in-house service requests, and guest-visible replies/history. Staff review submitted questionnaires and manage requests locally. Internal notes never enter the guest response. Requests need a complete import no older than 24 hours; stale pages explain the refresh requirement.

Verify mobile and desktop, required/multiple-choice/file validation, submitted read-only answers, local review, current catalogue items, request acknowledgement, staff replies, conflict refresh and cancelled/expired links. Existing `/g/` surveys remain disabled.

## Email setup and activation

1. Keep `GUEST_EMAIL_ENABLED=false` for all previews and initial manual-link rollout. The sender additionally requires `NODE_ENV=production`, `VERCEL_ENV=production` and no `DEV_BYPASS_AUTH`. Missing deployment target fails closed. Do not mislabel a preview as production.
2. Configure a verified sender/domain in Resend, `RESEND_API_KEY`, `GUEST_EMAIL_FROM`, and the production portal origin/key. These settings are independent of task-notification email settings. Verify the visible From identity before activation.
3. In Guest Profiles → Guest emails, select **Review existing bookings**. Counts show eligible, missing/invalid address, and excluded/already-queued reservations. The preview expires after 15 minutes; changes require another review.
4. Select **Activate future imports**. This records the first-import boundary and queues no historic backlog. Automatic welcome emails are due at midnight Colombo seven days before arrival; last-minute imports are due immediately. Only reserved stays with a valid primary address and recent complete source data qualify. In-house or past arrivals are excluded.
5. To include earlier imports, obtain a fresh review and explicitly choose **Queue N reviewed catch-up emails**. Future catch-up bookings wait until their due date; already-due bookings queue immediately. Re-sync never duplicates a welcome. Explicitly revoked links are not automatically recreated.
6. Only after production activation, configure a protected scheduler for `/api/cron/guest-profiles-sync` (frequent enough to keep the snapshot fresh) and `/api/cron/guest-portal` (e.g. every 10 minutes). Use `Authorization: Bearer <CRON_SECRET>` over HTTPS. Both GET and POST are accepted. This repository does not install schedules. Sync completion also enqueues eligible mail; page renders never send mail.

Delivery history means **provider accepted**, not confirmed inbox delivery. Jobs have two-minute leases, at most five transient attempts, immutable encrypted content and stable idempotency keys. A failed acknowledgement retries the exact original body/key. Changed recipient, booking dates, link or sender/account configuration after an uncertain attempt is held. Outcomes older than 23 hours are held before the provider's 24-hour deduplication window expires.

For held/failed outcomes, inspect the provider using the job's event key via a trusted server/admin query. Reconcile acceptance before any new delivery; do not blindly reset state or enqueue a resend. Preserve the original job as the audit record. Accepted emails can be explicitly resent from the staff UI; pending, held and failed jobs block a new resend. A controlled operator recovery can mark a verified accepted outcome with its provider ID; confirmed non-acceptance needs a separately reviewed new event. No automatic outbox purge deletes this evidence.

## Isolated acceptance fixture

Run `LO_TEST_DATABASE_URL=postgresql://<local-user>@127.0.0.1:55447/taru_lo LO_TEST_PORTAL=true node scripts/test-lo-oracle.mjs` first. This **resets only** the named disposable local database and rejects other hosts/ports/databases. Then run `LO_TEST_DATABASE_URL=... node scripts/lo-guest-portal-acceptance.mjs start`.

The harness rejects remote origins/databases, seeds synthetic records, runs Next on `127.0.0.1:3107`, and supplies fake loopback Supabase Auth/Storage on port 3318. Oracle credentials are empty; email is disabled at both configuration and preview-target guards. Provider delivery is intercepted at the module boundary in integration tests, including acknowledgement persistence failures; no actual provider is called by browser fixtures.

The fixture manifest and synthetic PDF are in `/private/tmp/taru-lo-guest-acceptance`. Sign in as `staff-fixture@example.invalid` / `fixture-password` (fixture only). Use CUA/browser tools for desktop/mobile checks. Separate local commands `cancel`, `expire`, `in-house`, `disable-catalogue`, `restore` change only this fixture's records. Stop with Ctrl-C; the checked-in release profile is never edited. Re-run the isolated database harness to discard all fixtures.

## Release checks and rollback

Release modules: `dashboard,tasks,fleet,daily-records,guest-profiles,sales-marketing,guest-portal,menus,excursions`. Disable guest emails and stop the scheduler first if rollout needs pausing. Revoke individual links through staff controls. Keep canonical snapshots and outbox audit records; do not delete/recreate pending jobs to retry. Module gating can hide portal routes while data remains intact. Keep Oracle read-only throughout.
