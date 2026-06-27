# Employee Task Management + Rename Survey "Tasks" → "Issues"

**Date:** 2026-06-27
**Status:** Approved (design)
**Phase:** 1 of an eventual 3 (Calendar and Gantt views are explicitly deferred to later phases)

## Summary

The platform currently has a "Tasks" feature that is **auto-generated from low-scoring
survey responses** (a quality-issue tracker). We are introducing a separate, **dedicated
employee task-management tool**, which will own the name "Tasks". To free up the name and
avoid permanent naming confusion, the existing survey-flagged feature is **fully renamed to
"Issues"** (user-facing strings, routes, code, and the database table), and a brand-new
`tasks` domain is built for the employee tool.

This spec covers **Phase 1** only:

1. **Full rename** of the existing survey-flagged feature: `tasks` → `issues`.
2. A new collaborative **Tasks** tool with a **Board** (kanban) and **List** view.
3. An admin-managed **Teams** dropdown ("Overall Responsible").
4. **Seeding** ~49 tasks from the executive "2006 Implementation Tracker" PDF.

**Deferred to later phases (out of scope here):** Calendar view, Gantt view, and task-to-task
dependency links. The Phase-1 schema reserves a nullable `startDate` so a future Calendar/Gantt
phase adds no migration churn to the core columns; the dependency-link table is **not** created
now (YAGNI until the Gantt phase).

---

## Part 1 — Rename: survey "Tasks" → "Issues"

The existing `tasks` table is structurally welded to surveys (`submissionId`, `responseId`,
`questionId` are all `NOT NULL` FKs into the survey domain). It is **not** changing shape — only
its name, everywhere.

### Database
- `ALTER TABLE tasks RENAME TO issues;`
- `ALTER TYPE task_status RENAME TO issue_status;` (values unchanged: `open | investigating | closed`)
- FK constraints and indexes auto-follow the rename; no data migration.
- **This migration MUST be applied before the renamed code deploys** (renaming a table read by
  deployed Server Components otherwise 500s — see the project's apply-before-merge rule). It runs
  **before** the new-tasks migration because the new feature reuses the now-freed enum name
  `task_status`.

### Code rename (mechanical, 1:1)
| Before | After |
|---|---|
| `src/lib/db/schema.ts`: `tasks` table, `taskStatusEnum`, `tasksRelations`, `Task`/`NewTask`, `properties.tasks` relation | `issues` table, `issueStatusEnum`, `issuesRelations`, `Issue`/`NewIssue`, `properties.issues` relation |
| `src/lib/db/queries/tasks.ts` (fns: `createTasksFromSubmission`, `getTasksForAdmin`, `getTasksForUser`, `getTaskById`, `updateTaskStatus`, `TaskFilters`) | `src/lib/db/queries/issues.ts` (fns: `createIssuesFromSubmission`, `getIssuesForAdmin`, `getIssuesForUser`, `getIssueById`, `updateIssueStatus`, `IssueFilters`) |
| `src/app/api/tasks/` (`route.ts`, `[id]/route.ts`) | `src/app/api/issues/` |
| `src/app/(portal)/tasks/` (`page.tsx`, `[taskId]/page.tsx`) | `src/app/(portal)/issues/` (`page.tsx`, `[issueId]/page.tsx`) |
| `src/components/tasks/` (`tasks-page-client.tsx`, `task-detail.tsx`) | `src/components/issues/` (`issues-page-client.tsx`, `issue-detail.tsx`) |
| In-component strings: `<h1>Tasks</h1>`, "Back to Tasks", page metadata title, `basePath`/`backHref` defaults (`/tasks` → `/issues`) | "Issues" equivalents |

### Survey integration (call sites)
- `src/app/api/surveys/route.ts` and `src/app/api/surveys/[id]/route.ts` import the auto-creation
  function. Update the import to `createIssuesFromSubmission` from `queries/issues.ts`. Behavior
  unchanged (score ≤ 6 AND `issueDescription` ⇒ create an Issue).

### Navigation & breadcrumbs
- `app-sidebar.tsx`: the existing item becomes `{ title: 'Issues', href: '/issues', icon: AlertTriangle }`
  (icon changes from `ListTodo` to a flag/triangle to visually distinguish from the new Tasks item).
  Keep its `showTasksNav` (admin + property_manager) gating — renamed in code to `showIssuesNav`.
- `header.tsx` `segmentLabels`: add `issues: 'Issues'` (and remove the stale `tasks: 'Tasks'` mapping,
  which the new feature re-adds in Part 2).

### Access (unchanged from today)
- Admin: all org issues. Property manager: assigned-property issues. **Staff: no access (403).**
- The renamed `task-detail` "View Survey" link and survey-origin empty-state copy are preserved.

---

## Part 2 — New "Tasks" employee tool

### Concept
A **collaborative** org-wide task board. Anyone (admin, property manager, **and staff**) can
create tasks, assign anyone, and edit any task. It is a shared board, not a per-property silo.

### Data model (`src/lib/db/schema.ts`)

**Enums**
- `task_status`: `todo | in_progress | stuck | done` (reuses the name freed by Part 1's rename)
- `task_priority`: `low | medium | high`

**`tasks`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `orgId` | uuid NOT NULL → organizations.id | multi-tenant |
| `title` | text NOT NULL | from PDF "Task" |
| `description` | text NULL | from PDF "Detail" + "Updates" merged |
| `status` | `task_status` NOT NULL default `todo` | |
| `priority` | `task_priority` NOT NULL default `medium` | |
| `propertyId` | uuid NULL → properties.id `ON DELETE SET NULL` | optional property tag |
| `dueDate` | date NULL | from PDF "Deadline" |
| `startDate` | date NULL | reserved for future Calendar/Gantt; unused in Phase 1 |
| `position` | integer NOT NULL default 0 | board ordering within a status column |
| `createdBy` | uuid NULL → profiles.id `ON DELETE SET NULL` | task author |
| `completedAt` | timestamptz NULL | set when moved to `done`, cleared if moved back |
| `createdAt` | timestamptz NOT NULL default now() | |
| `updatedAt` | timestamptz NOT NULL default now() | |

**`task_teams`** (admin-managed "Overall Responsible" dropdown — mirrors `sop_categories`)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid NOT NULL → organizations.id | |
| `name` | varchar(255) NOT NULL | |
| `sortOrder` | integer NOT NULL default 0 | |
| `createdAt`/`updatedAt` | timestamptz | |
| | | UNIQUE `(orgId, name)` |

**`task_assignees`** (M2M tasks ↔ profiles)
- `taskId` uuid NOT NULL → tasks.id `ON DELETE CASCADE`
- `profileId` uuid NOT NULL → profiles.id `ON DELETE CASCADE`
- UNIQUE `(taskId, profileId)`

**`task_team_links`** (M2M tasks ↔ task_teams)
- `taskId` uuid NOT NULL → tasks.id `ON DELETE CASCADE`
- `teamId` uuid NOT NULL → task_teams.id `ON DELETE CASCADE`
- UNIQUE `(taskId, teamId)`

Relations declared for all of the above. Types: `Task`/`NewTask`, `TaskTeam`/`NewTaskTeam`, etc.
(Note: `Task`/`NewTask` are now free because Part 1 renamed the old ones to `Issue`/`NewIssue`.)

### Queries (`src/lib/db/queries/tasks.ts` — new file)
- `getTasks(orgId, filters)` — org-wide list with assignees + teams + property name hydrated;
  filters: `{ propertyId?, status?, teamId?, priority?, assigneeId?, search? }`. Ordered by
  `status`, then `position`, then `createdAt`.
- `getTaskById(id)` — full task with assignees + teams.
- `createTask(data, assigneeIds, teamIds)` — transactional insert of task + join rows; `.returning()`.
- `updateTask(id, data, assigneeIds?, teamIds?)` — patch fields; when `status` changes to/from
  `done`, set/clear `completedAt`; replace assignee/team join rows when arrays are provided.
- `deleteTask(id)` — cascade removes join rows.
- `reorderTask(id, status, position)` — used by board drag-drop (updates status + position).
- Teams: `getTaskTeams(orgId)`, `createTaskTeam`, `updateTaskTeam`, `deleteTaskTeam`
  (all mutations `.returning()`). Deleting a team simply drops its `task_team_links` rows (cascade);
  no RESTRICT (a task losing a team tag is harmless).

### API routes (`src/app/api/tasks/`)
- `GET /api/tasks` — list (any active user). `POST /api/tasks` — create (any active user).
- `GET /api/tasks/[id]` — read. `PATCH /api/tasks/[id]` — update (any active user).
  `DELETE /api/tasks/[id]` — **creator or admin only** (403 otherwise).
- `PATCH /api/tasks/[id]/reorder` — board move (status + position).
- `GET /api/tasks/teams` — list (any active user, to populate the dropdown).
- `POST /api/tasks/teams` — create (**admin only**).
- `PATCH /api/tasks/teams/[id]` / `DELETE /api/tasks/teams/[id]` — (**admin only**).

All routes: `getProfile()` guard (401 if none, 403 if inactive); Zod validation; try/catch with
status codes; `z.string()` (not `.url()`); coerce nullable arrays to `[]` before Drizzle.

### Pages (`src/app/(portal)/tasks/`)
- `page.tsx` — `requireAuth()` (all active roles, **including staff**). `export const dynamic = 'force-dynamic'`.
  Loads tasks, teams, properties (for filters/tagging), and the org user list (for the assignee
  picker). Renders `<TasksPageClient>`.
- `teams/page.tsx` — `requireRole(['admin'])`. Admin CRUD for the Teams dropdown.

### Components (`src/components/tasks/` — new)
- `tasks-page-client.tsx` — owns the **Board ⇄ List** toggle via nuqs (`?view=board|list`, default
  `board`), the filter bar, and the create/edit dialog state. Hosts `<TasksAreaTabs>` (nav-style:
  "Board/List" lives here as an in-page toggle; "Teams" is a separate admin route, shown only to admin).
- `task-board.tsx` — 4 columns (`todo`/`in_progress`/`stuck`/`done`) with status colors
  (slate/amber/red/green). Native HTML5 drag-and-drop (`draggable`, `onDragStart`/`onDragOver`/`onDrop`)
  — **no new npm package**. Dropping a card calls `PATCH /api/tasks/[id]/reorder`. Each
  `task-card.tsx` shows title, team chips, assignee avatars (or "Unassigned"), due date, priority dot.
- `task-list.tsx` — filterable table (search, property, team, status, priority, assignee), columns:
  Title, Teams, Assignees, Property, Priority, Status, Due. Row click opens the edit dialog.
- `task-form-dialog.tsx` — create/edit form (React Hook Form + Zod): title, description, status,
  priority, property (optional Select), due date, multi-select assignees, multi-select teams.
- `task-teams-client.tsx` — admin Teams CRUD (add/edit/delete + reorder), mirroring `sop-categories`.
- `status` + `priority` color helpers live inline (status: slate/amber/red/green; priority dot:
  low=slate, medium=amber, high=red).

### Navigation
- `app-sidebar.tsx` `mainNavItems`: add `{ title: 'Tasks', href: '/tasks', icon: ListTodo }`,
  visible to **all roles** (no gating filter). Sits alongside the renamed "Issues" item.
- `header.tsx` `segmentLabels`: add `tasks: 'Tasks'`, `teams: 'Teams'`.
- No middleware change (no public routes).

### Permissions summary
| Action | admin | property_manager | staff |
|---|---|---|---|
| View / create / edit tasks | ✔ | ✔ | ✔ |
| Delete a task | ✔ (any) | own-created only | own-created only |
| Manage Teams dropdown | ✔ | ✘ | ✘ |

---

## Part 3 — Seed the PDF ("2006 Implementation Tracker")

A one-off seed script (committed under `scripts/` or run via `node -e` against `POSTGRES_URL`,
following the project's manual-apply convention). Idempotent where practical.

### Teams (seed `task_teams`, admin can add more later)
`Operations, Interior, Housekeeping, Culinary, Naturalists, Activities, Engineer, Purchase,
Finance, HR, General, MS Creatives, Media, CEO, Marketing` (15). The admin Teams page can extend
this list at any time.

### Field mapping
| PDF column | Target |
|---|---|
| TASK | `title` |
| DETAIL + Updates | `description` (DETAIL, then a blank line, then "Updates: …") |
| Deadline | `dueDate` — parsed (see below) |
| Overall Responsible | `task_team_links` (multi; combined values split on `/`, `,`, `&`) |
| Assigned To | **ignored** (users not onboarded) |
| Status | `status` |
| (none) | `priority` = `medium` for all |
| (none) | `propertyId` = null (general/org-wide) |
| (none) | `createdBy` = an admin profile in the org (looked up at seed time) |

### Status mapping
`Pending → todo`, `In Progress → in_progress`, `Completed → done`. (No PDF rows map to `stuck`.)

### Deadline parsing (tracker dated 12 June 2026)
- "DD. Month" → `2026-MM-DD` for June–December (e.g. "10. July" → `2026-07-10`).
- A month already past as of June 2026 rolls to next year: "31. March" → `2027-03-31`.
- "Immediate" / "Immeditate" → `dueDate` = null.

### Combined-team examples
"Interior / Operations" → [Interior, Operations]; "CEO, Marketing" → [CEO, Marketing];
"HR/General" → [HR, General]; "Culinary, Naturalists" → [Culinary, Naturalists];
"Culinary & Operations" → [Culinary, Operations]; "Culinary & Media" → [Culinary, Media];
"Interior/Engineer" → [Interior, Engineer]; "Interior/MS Creatives" → [Interior, MS Creatives].

---

## Migrations (hand-written, per the project's broken-drizzle-history convention)

Applied in order, **before** the corresponding code deploys (apply-before-merge):

1. **`drizzle/0018_rename_tasks_to_issues.sql`**
   - `ALTER TABLE tasks RENAME TO issues;`
   - `ALTER TYPE task_status RENAME TO issue_status;`
2. **`drizzle/0019_employee_tasks.sql`**
   - `CREATE TYPE task_status AS ENUM ('todo','in_progress','stuck','done');`
   - `CREATE TYPE task_priority AS ENUM ('low','medium','high');`
   - `CREATE TABLE task_teams (...);`
   - `CREATE TABLE tasks (...);`
   - `CREATE TABLE task_assignees (...);`
   - `CREATE TABLE task_team_links (...);`
   - Guarded with `IF NOT EXISTS` / `--> statement-breakpoint` per convention.

The TS schema in `src/lib/db/schema.ts` is hand-kept in sync.

---

## Testing & verification
- Survey submission still auto-creates **Issues** (rename smoke test): submit a survey with a
  ≤6 score + issue description → an Issue appears at `/issues`, "View Survey" link intact.
- Staff role: blocked from `/issues` (403/redirect), allowed on `/tasks`.
- Board drag between columns updates status + `completedAt` for `done`.
- Delete permission: a non-admin cannot delete a task they didn't create (403).
- Teams: admin can add a team; it appears in the task dialog dropdown; deleting it drops the tag.
- Seed: ~49 tasks present, statuses/teams/due dates mapped correctly, assignees empty.
- Coolify/Linux build is authoritative (local `tsc`/`build`/`lint` deadlock on the dev Mac):
  verify no unused imports/vars (ESLint breaks the Linux build).

## Out of scope (future phases)
- **Calendar view** (Phase 2) — reads `dueDate`/`startDate`; no schema change.
- **Gantt view + dependencies** (Phase 3) — adds a `task_dependencies` link table then.
- Comments/activity log, attachments, recurring tasks, notifications — not requested.
