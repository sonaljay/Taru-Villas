# LO Oracle connection

This release reads Oracle only. `/oauth/v1/tokens` is the sole Oracle POST;
all property requests are GET. Taru stores imported snapshots and guest actions
locally. `postPreArrival` is disabled before authentication or networking.

## Verified mapping and fields

Production verification on 2026-10-05 returned HTTP 200 for authentication,
hotel metadata, a bounded two-arrival search and one reservation detail.
Oracle identifies `LO` as **Taru Villas The Long House - Benota**. The matching
local property is **The Long House**. No shared database mapping was changed.
The arrival sample contained typed reservation IDs, names, email, phone,
arrival/departure dates, room quantity and status; the detail contained room stay
and reservation guests. Diagnostics never print their values or tokens.

## Activation order

1. Provision server-only variables from `.env.oracle.example` through the
   deployment's secret settings. Use production client credentials for imports.
   UAT credentials are isolated connection diagnostics; UAT cannot persist LO data.
2. Review the target schema and apply `drizzle/0037_lo_oracle_reservations.sql`
   through the approved migration process. The preview and release share a
   database; deploying a branch does not isolate data. Migration is additive and
   repeatable. No migration was applied to the shared database during development.
3. In Property Settings, verify the The Long House record and set Oracle Hotel
   ID to `LO`. Test connection on that property's Guest Profiles page to compare
   Oracle's hotel name. Assign property managers using existing property controls.
4. Refresh bookings. The job imports monthly arrivals over the coming twelve
   calendar months, current in-house guests, missing active reservations and
   details needed to resolve inventory. It stores work before moving its cursor.
   Continue refresh resumes paused work. Oracle failures retain the last complete
   snapshot. Review unknown quantities, unknown statuses and unresolved shares
   before interpreting the room-night report.
5. Configure an external protected scheduler only after checking imports.
   Call `GET` or `POST /api/cron/guest-profiles-sync` with
   `Authorization: Bearer <CRON_SECRET>`. Repeated invocations resume a run; one
   property worker holds a two-minute lease. Run at least hourly, with continued
   invocations while an import is running. Automated guest email stays disabled
   until its separate activation and catch-up controls are configured.

The staff refresh endpoint requires active admin or assigned property-manager
access in the property's organization. Hotel metadata and canonical records are
never accessible through anonymous Oracle API routes.

## Local validation

`scripts/test-lo-oracle.mjs` refuses any database other than disposable
`localhost:55447/taru_lo` (127.0.0.1 is also accepted). Set
`LO_TEST_DATABASE_URL` to that local database. It builds a pre-feature baseline,
applies the migration twice and runs synthetic fixtures. Do not point test
commands at the shared Supabase database. Tests cover scope, leases, duplicate
records, persistence, atomic rollback and preservation of local questionnaire state.

For a bounded live check, run `node scripts/verify-lo-oracle.mjs` in a terminal
and supply a JSON config on hidden stdin. Keys are `environment`, `gateway`,
`enterpriseId`, `clientId`, `clientSecret`, `appKey`; no guest data is persisted.
It rejects non-production gateways and makes at most two-arrival and one-detail
GET requests. Do not paste credentials into shell command arguments or git files.

## Evidence

At the foundation milestone, parser/transport/access/orchestration unit tests and
isolated PostgreSQL constraints/concurrency/rollback tests passed. The full suite
passed with existing environment-dependent integration suites skipped. Changed-file
lint and TypeScript passed. The initial sandboxed build could not fetch the
project's existing Google Fonts; the network-enabled build result is recorded below.

The network-enabled `npm run build` completed successfully on 2026-10-05.
Live GET diagnostics returned only the safe summary described above. Deployment
still requires secret provisioning, additive migration review, and the verified
LO mapping; no deployment, scheduler or guest email was activated.
