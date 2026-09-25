# Task Manager rollout and verification

Implementation is on the development branch. Do not promote to taru-release or
apply migration 0034 to the shared database until Sonal approves the finished
release. The private file bucket is a deployment prerequisite; email can remain deferred with
`TASK_EMAIL_ENABLED` unset or false.
no real-user mail or production migration is part of development testing.

## Local verification

Use a disposable PostgreSQL database only. The integration runner intentionally
resets its public schema and refuses any target other than localhost:55439/taru_tasks.

```sh
initdb -D /private/tmp/taru-task-postgres -A trust -U postgres
pg_ctl -D /private/tmp/taru-task-postgres -l /private/tmp/taru-task-postgres.log -o '-h localhost -p 55439' start
createdb -h localhost -p 55439 -U postgres taru_tasks
psql postgres://postgres@localhost:55439/taru_tasks -c 'CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);'
TASK_TEST_DATABASE_URL=postgres://postgres@localhost:55439/taru_tasks node scripts/test-task-workflow.mjs
RUN_FLEET_DB_TESTS=true RUN_VISIT_REPORT_DB_TESTS=true POSTGRES_URL=postgres://postgres@localhost:55439/taru_tasks npm test -- src/lib/fleet/vehicle-renewals.integration.test.ts src/lib/fleet/visit-reports.integration.test.ts
npm run lint
npx tsc --noEmit
npm test
npm run build
```

The runner generates a pre-workflow schema fixture from the repository, tests
preservation of legacy tasks/projects/Teams, applies the migration, and then tests
actual lifecycle concurrency and notification persistence. Normal unit tests skip
opt-in database suites; report those separately from passing tests.

## Approved deployment sequence

1. Snapshot the target database; record task/project/assignment counts and linked
   Fleet task IDs. Rehearse migration 0034 against a disposable snapshot.
2. Pause task/Fleet mutations while deploying the coordinated schema and code.
   Old application task-deletion behavior is incompatible with append-only history.
3. Apply `drizzle/0034_task_committee_workflow.sql` transactionally once. This is an
   additive migration; do not use schema push as a substitute for its triggers.
4. Verify retained IDs, completed timestamps, team links and project assignments.
   The migration assigns Operations and records migration events without emitting
   task notifications or retroactively demanding approval.
5. Configure Operations members through Task Manager → Committees. Only admins
   manage membership. Existing team labels do not imply committee membership.
6. Create private Supabase Storage bucket `task-attachments`. No public access or
   permissive client policies. Server-authorized signed downloads expire in 60s.
7. When email is approved, configure `RESEND_API_KEY`, a verified `TASK_EMAIL_FROM`, and HTTPS
   `TASK_APP_ORIGIN`, then enable `TASK_EMAIL_ENABLED=true`. Before enabling, cancel
   historical pending email jobs so activation does not replay old notices. Never expose these secrets as NEXT_PUBLIC variables.
8. Configure `CRON_SECRET` and the `/api/cron/task-notifications` every-minute worker schedule,
   `* * * * *` UTC, preserving vehicle-renewal scheduling. Requires a hosting plan
   supporting per-minute cron. Daily reminders become eligible at 08:00 Asia/Colombo;
   deduplication prevents repeated sends. Each sweep drains jobs for up to 35 seconds.
   Hosting plan scheduling guarantees may allow delay; do not promise exact-minute
   execution. Task actions attempt delivery after commit; cron retries durable jobs.
9. Validate one test recipient in-app and by email before enabling real-user
   notification delivery. Never broadcast test messages to existing committees.
10. Walk through property staff, assignee, Operations and receiving committee roles;
    test default/manual assignment, transfer pause, approve/reject, explicit resume,
    private files, comments and immutable history. Then reopen normal mutations.

## Delivery operations

Task Manager → Committees displays delivery errors to admins. The durable table
records attempts, pending/failed/cancelled/sent state and provider ID. Missing sender
configuration fails visibly. The task transaction itself still commits.

Approval requests become obsolete when ownership or review cycle changes. Reminder
jobs become obsolete when deadlines, assignees or completion change. Delivery
rechecks current visibility and membership. Email payloads and idempotency keys
remain identical across retries. An ambiguous email older than 23 hours requires
provider reconciliation before any manual retry; never blindly reset its key.

After correcting configuration, an operator can retry eligible failed deliveries
with an audited operations procedure. First check the provider for prior acceptance;
retain the original payload and key within its idempotency window. For jobs never
submitted to the provider, explicitly clear stale payload.email/emailStartedAt and
set state=pending, attempts=0, available_at=now(). Do not replay expired reminders or
superseded approval cycles; the worker cancels them on its next eligibility check.

File uploads create cleanup intentions before storage writes. Successful metadata
commits clear them. Failed uploads and removed files are cleaned by the scheduled
sweep after one hour. A bucket outage leaves durable cleanup intentions for retry.

## Recovery

Keep the database snapshot and original application revision. Migration preserves
legacy Teams data; do not drop it during rollback. Prefer rolling forward for UI or
mailer issues. A full rollback requires a reviewed database recovery plan because
old code can attempt task deletes now blocked by history guards. Stop delivery
workers before replay/recovery so restored jobs do not duplicate emails.

## Development verification record (2026-09-25)

333 unit tests passed. The disposable workflow suites passed 12 migration,
transaction/concurrency, visibility and delivery tests; the renewal integration
regression passed. Type checking and production build passed; lint had no errors.
Desktop/mobile browser checks covered projectless creation, approval blocking and
explicit resume, and timestamped comments. Independent review findings were fixed.

The existing visit-report integration test has a stale draft expectation (missing
`primaryReasonId` and `observations` defaults); the same failure was reproduced on
unchanged main. Live private-storage and email-provider verification remains part
of the approved deployment sequence above.
