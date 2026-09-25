# Task Manager redesign

Status: proposed design for review. Product decisions below reflect the conversation;
implementation defaults are explicitly identified. No production changes are authorized
by this document. Development targets main; taru-release requires Sonal's approval.

## Intended outcome

Give staff a single, actionable view of tasks, with clear ownership, deadlines,
committee decisions, and a timestamped record of every action. Management can see
work across properties; staff see work relevant to their property and committee.
The source PDF is a requirements reference; subsequent user decisions govern.

## Agreed product behavior

- Tasks are the primary view. Project is optional; selecting a project filters
  the same task view. Existing project assignments remain intact.
- Committees replace Teams. Admins create committees and assign their members.
- New tasks automatically belong to Operations, without requiring approval.
- Operations can require approval for a task.
- Manually selecting a committee, including Operations, requires approval.
- Only Operations members and admins can transfer committee ownership, including
  returning a task. Ownership transfers to the receiving committee.
- Every transfer requires fresh approval. In-progress work pauses pending approval.
- Any member of the current owning committee may approve or reject.
- Tasks requiring approval cannot start, resume, or complete until approved.
- Assignees, owning committee members, and admins may edit task details and
  progress, subject to approval gates and the specific transfer permissions above.
- Property staff see their property's tasks; committee members additionally see
  tasks owned by their committee across properties. Admins see everything.
- Include dated comments, photo/file attachments, and an audit history of every
  mutation with its actor, timestamp, and previous/new values where applicable.
- Include in-app and email notifications for assignments, committee transfers,
  approval requests/decisions, and deadlines.
- Notify assignees one day before a deadline, then once daily while overdue.
  Approval requests notify all active members of the owning committee.
- Display task age, overdue state, and creation date. Age stops at completion.

## Recommended interface

Open Task Manager directly to a searchable, paginated table. Provide quick views
for all visible tasks, assigned to me, overdue, awaiting approval, and completed.
Filters cover property, project, priority, status, responsibility, committee, and
approval. Show counts based on the viewer's authorized scope.

Rows show task title, property, optional project, priority, committee, approval,
assignees, progress, date raised, age, and deadline. Allow horizontal scrolling
on desktop; use compact cards on small screens. Do not squeeze every field into
a narrow mobile table. Default open-task ordering is overdue first, then priority,
then nearest deadline, with stable ordering for ties.

Selecting a task opens a detail panel with description, editable fields, decisions,
comments, attachments, and the activity timeline. On mobile this occupies the full
screen. Projects remain accessible as filtered views. Committee administration is
admin-only. Existing task deep links continue to resolve with access checks.

## State and permission implementation

Keep work progress separate from approval: todo, in_progress, stuck, done remain
work states; approval is not_required, pending, approved, or rejected. Present
Awaiting Approval prominently when pending. Store the pre-transfer work state;
approval permits an explicit resume rather than silently restarting work.

Each approval cycle has an identifier/version. A transfer invalidates prior
approval. Approval and transfer use a transaction and concurrency checks so a
stale decision cannot approve a task for its former committee. Enforce these
rules in APIs and database query helpers, not only in the UI.

Apply organization boundaries and visibility checks to lists, counts, direct
links, mutations, attachments, notifications, and search. An individual assignee
must be able to view their assigned task to exercise the agreed editing rights.
No committee or property assignment may grant access outside the organization.

## Proposed implementation defaults for review

- Only Operations members/admins can manually choose a non-default committee at
  creation, matching their exclusive right to transfer ownership afterward.
- Admins have full editing/transfer access; approving still requires membership
  in the owning committee, matching the agreed approval rule.
- Operations members can transfer a task even after it leaves Operations, but
  this grants only the necessary review/transfer access, not general editing.
- Rejection keeps work blocked. Operations/admins can request a new review cycle;
  every decision and resubmission remains in history.
- Changes to description, ownership, scope, or attachments supporting a decision
  after approval invalidate approval and require another review. Comments alone
  do not. The implementation plan will enumerate the exact affected fields.
- Completed tasks must be explicitly reopened before transfer. Reopening is
  audited; age then runs from original creation until the next completion.
- Comments and audit entries cannot be silently overwritten or hard-deleted.
  Corrections are appended; attachment removal retains an audit tombstone.
- Use Asia/Colombo calendar dates for reminders and deadline/age calculations.
  Run daily reminders at 08:00 local time. Date-only deadlines become overdue on
  the following local day. No reminders for completed tasks or absent deadlines.
- Notify current assignees of assignments and approval decisions. Notify receiving
  committee members of transfers/review requests; combine overlapping events to
  avoid duplicate messages. Restrict delivery to active, authorized recipients.

## Data and component changes

Make tasks.projectId nullable. Add organization-scoped committees, memberships,
owning committee and approval state/cycle fields, decision records, comments,
attachment metadata, and append-only task events. Keep an Operations committee
per organization and prevent its deletion while used as the default.

Centralize task authorization and lifecycle transitions. Creation, edit, transfer,
approval, completion, and reopening must write their audit event atomically with
the task mutation. Existing Fleet/visit-report/renewal task producers must use
these rules too, retaining their existing restrictions on managed fields.

Reuse current notification storage for the in-app inbox. Add a transactional
delivery queue with channel, recipient, event key, attempt count, retry time, and
delivery result. Email sending happens after commit; failures do not roll back
the task. Unique event/recipient/channel keys prevent duplicate enqueueing;
provider idempotency should prevent duplicates on ambiguous delivery retries.
Reminder keys include task, recipient, deadline version, reminder type, local
date, and channel. Recheck current eligibility before delivery.

The inspected repository has notification storage but no identified general
application email sender. A verified sender and delivery credentials are a
deployment prerequisite. Keep provider integration behind a small adapter;
select the provider during implementation planning after checking available
account configuration. Missing configuration must surface as an operational
failure, never be reported as successful email delivery.

Store task files privately with authorized upload/download endpoints and expiring
download URLs. Proposed first-round limits: JPEG, PNG, WebP, PDF, DOCX, and XLSX;
10 MB per file. Validate actual file type, size, task access, and organization.
Record uploads/removals with actor and timestamp. Do not expose public URLs or
send file contents in email notifications.

## Migration and preservation

Use additive migrations first. Preserve all tasks, projects, assignees, completed
timestamps, and report links. Assign existing tasks to Operations without
retroactively blocking work or generating notification floods. Record a clearly
labeled migration event; do not invent historical actors or decisions.

Remove Teams from active UI/API use, but retain legacy team records and links for
historical recovery. Do not infer committee memberships from team labels: current
team links do not establish the approved committee membership model. Admins must
configure Operations membership before rollout. Disable new review requests for
committees without active members and explain how an admin can resolve this.

Keep old project/task links functional. Migration must be rehearsed with a
database snapshot and counts/relationships verified. Do not run it against the
shared production database as part of development without deployment approval.

## Validation and rollout

Test the permission matrix across property, committee, assignee, admin, inactive
user, and organization boundaries. Test manual/default assignment, transfers,
rejection/resubmission, stale concurrent approvals, blocked status transitions,
completion/reopening, and Fleet-managed fields. Verify every mutation has its
atomic audit event, including comments and attachment actions.

Test notification recipient selection, retries, deduplication, changed deadlines,
completed tasks, local-day boundaries, and authorized deep links. Verify private
file access and invalid uploads. Test projectless tasks and preserved old links.
Run repository checks and validate the interface on desktop and mobile.

Implement and test on main. The approved-module deployment profile stays intact.
Do not promote to taru-release or deploy to production until Sonal approves the
finished implementation.
