# Visit report categories — rollout and verification

## Prepared
Four versioned categories preserve 59 inspection prompts and 22 scorecard items
from the supplied report templates. The form supports repeated areas, per-question
private photos (up to five), optional Task Manager follow-ups, and manager read
acknowledgement. Templates can be edited under Admin → Fleet → Visit Report
Categories; changes only affect newly started reports.

## Rollout dependency
Apply `drizzle/0035_visit_report_templates.sql` **before** deploying this code.
It is additive and requires Task Manager migration 0034. Back up the shared
database before running it. It seeds templates for existing organizations and
adds report snapshots, answers, private-photo metadata, append-only events and
manager acknowledgement assignments. No existing report content is rewritten.
The schema mapping adds columns to normal Fleet queries, so deploying code before
the migration will break Fleet report queries.

The existing `task-attachments` bucket must remain private, with a 10 MB limit
and JPEG/PNG/WebP enabled. The existing task notification worker processes durable
photo cleanup. Existing service-role storage credentials are reused. No new email
configuration is required; manager notifications are in-app.

Ensure each property has active property managers via its primary manager or
property assignments. Reports notify those managers on submission and revision.
Acknowledgement means read, not approval, and remains available after editing
closes. Managers removed from a property no longer have report access through that
assignment; the audit keeps their historical events.

## Validation
- Disposable database: Task Manager migration/workflow/lifecycle/delivery suites,
  then category report integration tests. All passed.
- Category tests cover stale saves and submission retries, task creation, traveller
  access, hidden-task legacy API protection, frozen template versions, read receipts,
  assignment audit, editing expiry, concurrent five-photo reservations, image
  validation, private signed reads, removed photos and failed-upload cleanup.
- Unit suite, TypeScript, production build and lint passed (existing lint warnings).
- Browser: category selection; facilities draft save; repeated-area add/remove;
  submission; manager mobile read receipt; desktop/mobile layout; admin template
  version publication. All exercised against disposable local fixtures.
- Storage transport tested with a stub; no live report-photo upload performed.
  Camera capture uses the native mobile file input and still needs a physical-device
  check after deployment. The existing private bucket was verified in the prior
  Task Manager rollout.

No shared migration, release promotion, or email sending was performed for this
feature. Release remains subject to Sonal's approval.

## Reproduce integration tests
Use only the disposable `localhost:55439/taru_tasks` database. First run
`scripts/test-task-workflow.mjs` with `TASK_TEST_DATABASE_URL` set to that database;
this recreates its schema and applies migration 0034. Then run Vitest for
`src/lib/fleet/structured-reports` with the same variable; its setup applies 0035.
Never point these tests at a shared database.
