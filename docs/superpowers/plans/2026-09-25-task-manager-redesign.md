# Task Manager Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execution method remains for the user to select.

**Goal:** Deliver the approved unified task view, committee ownership and approvals, audit history, attachments, and in-app/email notifications without losing existing work.

**Architecture:** Extend the existing Next.js/Drizzle task module. Centralize authorization and lifecycle commands, transactionally record audit events and notification intentions, and use private Supabase storage for attachments. Keep task progress and approval separate.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle/PostgreSQL, Supabase, existing shadcn components, Vitest, and the existing cron authentication pattern.

**Spec:** `docs/superpowers/specs/2026-09-25-task-manager-redesign.md` (approved by Sonal).

## Global Constraints

- Development targets main; taru-release requires Sonal's approval.
- Do not run migrations against the shared production database during development.
- Preserve tasks, projects, assignees, report links, and historical timestamps.
- Project is optional; default Operations assignment does not require approval.
- Explicit committee selection and every ownership transfer require fresh approval.
- Only Operations members/admins transfer ownership; only owning committee members approve.
- In-progress work pauses after transfer; approval permits explicit resume.
- Record every mutation atomically with actor, timestamp, and before/after values.
- Property, assignee, committee, and organization restrictions apply on the server.
- Use Asia/Colombo calendar dates; deadline reminders run at 08:00 local time.
- Notify one day before the deadline and daily while overdue; stop on completion.
- Retain legacy Teams data for recovery while removing active Teams interfaces.
- Keep existing Fleet-managed task restrictions and approval gates together.
- Preserve the user's existing untracked files and other worktree modifications.

## Review Focus

1. Two committee members decide simultaneously: only one decision wins for the current cycle (Task 3).
2. Membership changes after a notification is queued: stale recipients cannot receive confidential task content (Task 6).
3. A paused Fleet task is auto-completed by another subsystem: no approval bypass or partial update (Task 4).
4. A deadline changes near midnight: no duplicate or incorrect-day reminders (Task 6).
5. An upload succeeds but metadata persistence fails: no public/orphaned file or fabricated audit event (Task 5).

## File boundaries and execution order

Execute Tasks 1–8 sequentially. UI consumes the lifecycle/access interfaces, and
notification delivery consumes committed events. Do not parallelize schema and
lifecycle edits. Prepare a dedicated development checkout using the worktree
skill at execution time; integrate into main after verification, preserving
concurrent changes. Never create a new user-owned Codex task implicitly.

- `src/lib/tasks/types.ts`: shared actor, lifecycle command, and view contracts.
- `src/lib/tasks/policy.ts`: pure authorization and transition decisions.
- `src/lib/tasks/lifecycle.ts`: transaction-backed mutations/audit/outbox.
- `src/lib/db/queries/task-committees.ts`: admin committee/member persistence.
- `src/lib/tasks/attachments.ts`: private file validation and lifecycle.
- `src/lib/tasks/notifications.ts`: recipients, queue claims, deliveries.
- `src/lib/tasks/reminders.ts`: local-date eligibility and deduplication keys.
- `src/lib/tasks/email.ts`: provider adapter; no provider details in UI.
- Existing task query/API/component modules: scoped reads and presentation.
- `src/components/tasks/task-detail-panel.tsx`: details, decisions, comments, files, history.
- `src/components/tasks/task-committees-client.tsx`: committee admin UI.
- `docs/runbooks/task-manager.md`: migration, delivery setup, recovery, acceptance.

## Shared interface contracts

Create these contracts in Task 1; later tasks must import rather than redefine them.

```ts
export type Approval = 'not_required' | 'pending' | 'approved' | 'rejected'
export type Progress = 'todo' | 'in_progress' | 'stuck' | 'done'
export type Actor = {
  kind: 'user' | 'system'; orgId: string; profileId: string | null
  isAdmin: boolean; isActive: boolean; propertyIds: string[]
  committeeIds: string[]; operationsCommitteeId: string
}
export type TaskScope = {
  orgId: string; propertyId: string | null; committeeId: string
  assigneeIds: string[]; status: Progress; approval: Approval
  version: number; approvalCycle: number
}
export type TaskPatch = {
  title?: string; description?: string | null; propertyId?: string | null
  projectId?: string | null; dueDate?: string | null
  priority?: 'low' | 'medium' | 'high'; assigneeIds?: string[]
}
export type TaskCommand =
  | { type: 'edit'; patch: TaskPatch }
  | { type: 'transfer'; committeeId: string; reason: string }
  | { type: 'require_approval'; reason: string }
  | { type: 'decide'; cycle: number; decision: 'approved' | 'rejected'; note: string }
  | { type: 'resubmit'; reason: string }
  | { type: 'progress'; status: Progress }
  | { type: 'reopen'; reason: string }
export type EmailMessage = { to: string; subject: string; text: string; key: string }
```

Actor membership is loaded from the database, never accepted from request JSON.
System actors are explicit producer identities; they do not bypass approval gates.

### Task 1: Additive schema and migration rehearsal

**Files:** Modify `src/lib/db/schema.ts`; create `src/lib/tasks/types.ts`,
`drizzle/0034_task_committee_workflow.sql` (verify name remains unused),
`src/lib/tasks/migration.integration.test.ts` and `docs/runbooks/task-manager.md`.

**Produces:** committees, committee memberships, task events, comments, attachment
metadata, approval decisions, delivery queue; task ownership, version, approval
cycle, paused progress and deadline-version fields.

- [ ] Write migration integration fixtures containing active/completed tasks,
  existing projects, legacy team links, and Fleet-linked tasks. Assert counts and
  foreign-key identities survive, new projectless tasks insert successfully, and
  legacy tasks become Operations-owned/not_required without outgoing messages.
- [ ] Run `npm test -- src/lib/tasks/migration.integration.test.ts` against an
  explicitly configured disposable database. Require failure before schema work.
- [ ] Add Drizzle definitions and additive SQL. Seed one Operations committee per
  organization, backfill ownership, then enforce non-null ownership. Keep legacy
  Teams tables. Use a partial unique index for each organization's Operations row.
  Store audit actor kind/profile, event kind, task version, JSON before/after, and
  database timestamp. Snapshot actor display names to preserve attribution.

```sql
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;
-- All new organization-owned tables carry org_id and explicit foreign keys.
-- Backfill precedes NOT NULL; use composite ownership constraints where needed.
CREATE UNIQUE INDEX task_events_task_version_unique
  ON task_events(task_id, task_version);
CREATE UNIQUE INDEX task_decision_cycle_unique
  ON task_approval_decisions(task_id, approval_cycle);
CREATE UNIQUE INDEX task_delivery_key_unique
  ON task_notification_deliveries(event_key, profile_id, channel);
```

- [ ] Enforce append-only event/decision rows for the application role. Use new
  events to correct history; actor deletion must not erase attribution. Add
  indexes for organization/property/committee, task history, and queue claiming.
- [ ] Rehearse migration/rollback of application code on a disposable snapshot;
  retain additive data rather than dropping historical tables on rollback.
- [ ] Verify fixture counts, constraints and no notification flood; commit only
  these files with `feat(tasks): add committee workflow schema`.

### Task 2: Committee administration and access policy

**Files:** Create `src/lib/tasks/policy.ts`, `policy.test.ts`,
`src/lib/db/queries/task-committees.ts`, `src/app/api/tasks/committees/route.ts`,
`src/app/api/tasks/committees/[id]/route.ts`,
`src/components/tasks/task-committees-client.tsx`,
`src/app/(portal)/tasks/committees/page.tsx`.
Modify task queries, project queries, Teams pages/routes, task-area tabs.

**Produces:** `canViewTask(actor: Actor, task: TaskScope): boolean`,
`canEditTask(actor: Actor, task: TaskScope): boolean`,
`canTransferTask(actor: Actor, task: TaskScope): boolean`,
`canDecideTask(actor: Actor, task: TaskScope): boolean`.

- [ ] Write table-driven tests for admin, assignee, property staff, current/former
  committee member, inactive user, Operations transfer-only access, foreign org.
  Example core test body (fixtures define complete Actor/TaskScope objects):

```ts
expect(canViewTask({ ...actor, orgId: 'other' }, task)).toBe(false)
expect(canEditTask({ ...actor, committeeIds: [task.committeeId] }, task)).toBe(true)
expect(canDecideTask({ ...actor, isAdmin: true, committeeIds: [] }, task)).toBe(false)
```

- [ ] Run `npm test -- src/lib/tasks/policy.test.ts`; confirm failure.
- [ ] Implement scope checks: active same-org actor first, then admin/property/
  assignee/committee visibility. Operations transfer review gets a limited view
  needed to act, not unrestricted task editing. Filter counts, projects, lists,
  search and direct GET endpoints with the same server-side predicates.
- [ ] Admin endpoints create/rename/archive committees and replace memberships
  transactionally. Reject cross-org/inactive membership, protect Operations,
  and prevent archiving a committee owning open tasks. Record committee edits
  and membership history too, including actor and timestamp.
- [ ] Remove Teams from navigation and block new legacy team mutations. Preserve
  read-only historical data and redirect old Teams navigation to Committees.
- [ ] Run policy tests plus committee API/integration tests for invalid membership
  and empty-committee review rejection. Commit `feat(tasks): manage committees and scoped access`.

### Task 3: Atomic lifecycle and approval audit

**Files:** Create `src/lib/tasks/lifecycle.ts`, `lifecycle.integration.test.ts`;
modify task create/edit/reorder APIs and `src/lib/db/queries/tasks.ts`.
Create `src/app/api/tasks/[id]/actions/route.ts`.

**Produces:** `executeTaskCommand(actor: Actor, taskId: string,
expectedVersion: number, command: TaskCommand): Promise<TaskWithRelations>`.
Creation also uses this module through `createWorkflowTask`, accepting a nullable
project, initial assignees and an explicit/default committee-selection indicator.

- [ ] Write tests for default Operations, explicit Operations, explicit other
  committee, approval, rejection/resubmission, transfer, paused work, completion,
  reopening, no-op edits, stale versions and a decision racing a transfer.
- [ ] Run `npm test -- src/lib/tasks/lifecycle.integration.test.ts`; confirm failures.
- [ ] Use row locks and expected versions; re-read actor membership in the
  transaction. Enforce approval before in_progress/done, and require an explicit
  resume after approval. Approval increments task version but not the cycle;
  transfers/resubmissions invalidate the old cycle. Return 409 for stale requests.

```ts
if (current.version !== expectedVersion) throw new TaskConflict()
if (command.type === 'progress' && ['in_progress', 'done'].includes(command.status)
    && !['not_required', 'approved'].includes(current.approval)) {
  throw new TaskApprovalRequired()
}
// Within the same database transaction:
// validate -> update task -> append event -> append delivery intentions -> commit.
```

- [ ] Invalidate an approved cycle when title, description, property, project,
  assignees or decision-supporting files change. Due-date and priority edits are
  audited but do not change scope or require another decision. Treat task-level
  files as supporting evidence; comments remain non-invalidating.
- [ ] Require Operations/admin for approval requirement/resubmission. Do not expose
  a generic patch of committee/approval fields. Reject transfer of completed tasks
  until reopened. Stop age at completion; reopening resumes from original creation.
- [ ] Replace task hard deletion with audited archival for the new workflow; keep
  Fleet-linked task retention restrictions. Do not permit audit removal.
- [ ] Test parallel decisions: exactly one succeeds and there is one decision
  row for the cycle. Test rollback leaves no task/event/outbox partial writes.
- [ ] Run lifecycle and existing task report guard tests; commit `feat(tasks): enforce approval lifecycle and audit history`.

### Task 4: Preserve Fleet and other task producers

**Files:** Modify `src/lib/db/queries/issues.ts`, `dispatches.ts`,
`vehicle-renewals.ts`, `fleet-trip-reports.ts`, and their integration tests.
Extend lifecycle module with transaction-aware internal helpers.

**Consumes:** Task 3 mutation/audit primitive, accepting an existing transaction
so a Fleet mutation and its linked task transition commit or fail together.

- [ ] Extend existing integration tests: generated tasks get Operations defaults,
  manual assignments remain intact, and Fleet-generated edits record audit events.
- [ ] Test attempted Fleet completion of an approval-blocked task returns a clear
  conflict and rolls back the producer action; never silently mark the task done.
- [ ] Run `npm test -- src/lib/fleet/visit-reports.integration.test.ts src/lib/fleet/vehicle-renewals.integration.test.ts` in the disposable database.
- [ ] Replace direct writes found by the following inventory with the shared
  transaction-aware primitive; preserve visit-report/renewal-managed fields:

```bash
rg -n 'insert\(tasks\)|update\(tasks\)' src/lib/db/queries
```

- [ ] Assert changing vehicle/report-owned deadline, project or assignees through
  Task Manager still fails. Apply the same approval invalidation to system edits.
- [ ] Verify producer errors explain the approval blocker without partial state;
  commit `fix(tasks): preserve linked workflow rules and audit producer changes`.

### Task 5: Comments, private files, and timeline

**Files:** Create `src/lib/tasks/attachments.ts`, `attachments.test.ts`,
`src/app/api/tasks/[id]/comments/route.ts`,
`src/app/api/tasks/[id]/attachments/route.ts`,
`src/app/api/tasks/[id]/attachments/[attachmentId]/route.ts`,
`src/app/api/tasks/[id]/history/route.ts`.

**Produces:** append-only comments/events and metadata-backed private attachments.
All endpoints use Task 2 access and Task 3 transaction/audit conventions.

- [ ] Write tests for unauthorized downloads, foreign-org IDs, MIME spoofing,
  files over 10 MB, invalid office archives, upload/DB failures and tombstoned files.
- [ ] Run `npm test -- src/lib/tasks/attachments.test.ts`; confirm failures.
- [ ] Configure a private `task-attachments` bucket during approved deployment,
  not implicitly against production. Generate random storage paths from trusted
  organization/task IDs. Validate JPEG/PNG/WebP/PDF signatures and DOCX/XLSX ZIP
  manifests; add a focused ZIP parser only if no existing dependency safely fits.
- [ ] Stage uploads privately, then commit metadata and audit event after verifying
  stored bytes. If DB commit fails, delete the staged object; queue cleanup if
  deletion fails. Incomplete uploads never appear as attachments.
- [ ] Issue short-lived signed downloads only after fresh authorization. Removing
  a file tombstones metadata, records the event, and queues object cleanup.
- [ ] Comment edits are appended corrections, not replacements. Audit endpoints
  paginate in stable timestamp/id order. Pending approval still permits comments
  and uploads; approved evidence changes create a new approval cycle.
- [ ] Run attachment and history integration tests; commit `feat(tasks): add private attachments and activity history`.

### Task 6: In-app/email delivery and reminders

**Files:** Create `src/lib/tasks/notifications.ts`, `email.ts`, `reminders.ts`,
`notifications.test.ts`, `reminders.test.ts`,
`src/app/api/cron/task-notifications/route.ts`,
`src/app/api/notifications/route.ts`, `src/app/api/notifications/[id]/route.ts`,
`src/components/layout/notification-inbox.tsx`; modify portal header and `vercel.json`.

**Produces:** `sendTaskEmail(message: EmailMessage): Promise<{providerId: string}>`
and `reminderKind(dueDate: string | null, status: Progress, now: Date):
'upcoming' | 'overdue' | null`.

- [ ] Write tests for duplicate enqueue, interrupted delivery, two workers claiming
  one job, removed committee member, inactive assignee, changed deadline, completed
  task, missing sender configuration and exact Asia/Colombo date boundaries.
- [ ] Run `npm test -- src/lib/tasks/notifications.test.ts src/lib/tasks/reminders.test.ts`; confirm failures.
- [ ] Persist stable event/recipient/channel keys in the task transaction. Claim
  jobs with `FOR UPDATE SKIP LOCKED`, a lease expiry and bounded batch size. Recheck
  scope/membership and reminder eligibility before sending. Insert the in-app row
  and mark its delivery complete transactionally; email failure is independent.
- [ ] Implement provider adapter using Resend HTTP API as the proposed first
  adapter, pending deployment credential availability. Require RESEND_API_KEY,
  TASK_EMAIL_FROM and a configured trusted application origin. Never create an
  account, buy a plan, or send real-user test mail during implementation.

```ts
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
    'Idempotency-Key': message.key },
  body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
})
```

  Validate the response before marking sent. Preserve the exact payload and key
  on retry. Retry transient failures with backoff; permanent failures remain
  visible to admins. Do not retry ambiguous sends beyond the provider's dedup
  window without reconciliation. Verify current limits at implementation time.
  Sources: [send email](https://resend.com/docs/api-reference/emails/send-email),
  [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
- [ ] Attempt event deliveries after successful mutations using the runtime's
  supported post-response execution, with the durable queue as source of truth.
  Add an authenticated scheduled sweep; preserve existing vehicle-renewal cron.
  On hosting with daily-only cron, use `30 2 * * *` for the 08:00 local reminder
  sweep and document that failed immediate emails retry on that daily sweep.
  Do not promise minute-precise cron execution beyond hosting guarantees.
- [ ] Inbox supports unread count, paginated reads and owner-only mark-read.
  Approval requests notify owning members; assignments/decisions notify current
  assignees. Combine transfer and approval request notifications to the same user.
- [ ] Test reminders: Jan 2 local deadline yields upcoming on Jan 1, no overdue
  on Jan 2, overdue Jan 3. Changed deadline version invalidates pending jobs.
- [ ] Commit `feat(tasks): deliver notifications and deadline reminders`.

### Task 7: Unified task table and detail panel

**Files:** Modify `src/app/(portal)/tasks/page.tsx`,
`src/app/(portal)/tasks/[projectId]/page.tsx`, task query/API files,
`src/components/tasks/tasks-page-client.tsx`, `task-list.tsx`, `task-form-dialog.tsx`,
`task-meta.tsx`, `projects-landing-client.tsx`, and `tasks-area-tabs.tsx`.
Create `src/components/tasks/task-detail-panel.tsx`, `task-activity.tsx`,
`src/lib/tasks/task-view.ts`, `task-view.test.ts`.

**Consumes:** scoped paginated task reads, lifecycle actions, committee admin,
comments/attachments/history and notification endpoints.

- [ ] Write tests for filters, overdue/priority/deadline stable ordering, projectless
  tasks, age freeze/reopen and authorized quick-view counts. Run
  `npm test -- src/lib/tasks/task-view.test.ts` and confirm failure.
- [ ] Replace project landing as the main view with the unified table. Keep Projects
  as a view/filter and preserve existing project task links. Use server-side
  filtering and pagination with URL-backed filters, not full-org browser filtering.
- [ ] Build the approved columns, quick views, count summaries, project selector,
  and responsive mobile cards. Show human-readable names for responsibility.
  Keep pending approval separate from work progress; do not imply work can start.
- [ ] Detail panel exposes only allowed actions, with reason/decision inputs,
  stale-edit conflict handling, explicit resume/reopen, comments, file upload,
  audit timeline and visible delivery failures for admins. Use full-screen mobile
  details, keyboard navigation, focus restoration and labeled controls.
- [ ] Default committee field clearly says automatic Operations; explicit selection
  shows the approval consequence before save. Show nullable Project as No project.
- [ ] Verify empty/error/loading states and links from existing Fleet notifications.
  Run desktop/mobile walkthroughs with fixture users and compare visibility.
- [ ] Commit `feat(tasks): introduce consolidated task workspace`.

### Task 8: Whole-workflow verification and release handoff

**Files:** Extend task/Fleet integration tests and `docs/runbooks/task-manager.md`.
No release-branch changes in this task.

- [ ] Run the complete chain with separate fixture users: create ungrouped task,
  assign users, start work, transfer committee, verify pause, reject, resubmit,
  approve, explicitly resume, attach evidence, reapprove, complete, and reopen.
  Verify audit ordering and recipients at every step. Do not send real-user emails.
- [ ] Rehearse migration on a disposable snapshot, including legacy Teams and
  completed Fleet tasks. Confirm existing links, counts, timestamps and assignees.
- [ ] Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build`.
  Run guarded DB integration tests against the disposable database separately;
  do not claim skipped tests passed. Resolve failures caused by this change.
- [ ] Review authorization, concurrent approval, private files and audit integrity.
  Review the complete diff for unrelated edits and secret values.
- [ ] Record deployment prerequisites: Operations members, verified email sender,
  private storage, cron support, database snapshot, migration sequence, monitoring,
  and code rollback. Include queue recovery and failure visibility.
- [ ] Integrate verified work into main without overwriting concurrent changes.
  Present the finished feature and validation evidence to Sonal. Keep taru-release
  unchanged until explicit approval of that finished implementation.

## Self-review and handoff

Coverage: optional Projects (1,7), committees/visibility (1,2), lifecycle/audit
(3,4), comments/files (5), notifications/reminders (6), UI/age (7), preservation
and release control (1,4,8). All five Review Focus cases have assigned tests.

Before execution, user reviews this plan and chooses native or subagent-driven
execution. Approval of the design authorized preparation of this plan, not a
production migration or release deployment.
