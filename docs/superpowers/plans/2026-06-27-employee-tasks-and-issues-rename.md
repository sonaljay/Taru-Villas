# Employee Tasks + Rename Survey Tasks→Issues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the existing survey-flagged "Tasks" feature to "Issues" (code + DB), then build a new collaborative employee "Tasks" tool (Board + List views, admin-managed Teams dropdown), and seed ~48 tasks from the Implementation Tracker PDF.

**Architecture:** Three independently-deployable milestones. M1 renames `tasks`→`issues` everywhere (mechanical 1:1). M2 adds a brand-new `tasks` domain (its own tables/enums/queries/API/pages/components) that reuses the freed `task_status` name. M3 is a one-off seed script. All UI follows existing codebase patterns (SOP categories, the renamed Issues list, shadcn dialogs); no new npm packages — the kanban board uses native HTML5 drag-and-drop.

**Tech Stack:** Next.js 16 (App Router, RSC), Drizzle ORM + postgres.js, Supabase Postgres, shadcn/ui + Tailwind 4, React Hook Form + Zod v4, nuqs, lucide-react, Sonner.

## Global Constraints

- DB client must keep `{ prepare: false }` (PgBouncer) — never change `src/lib/db/index.ts`.
- Zod v4: use `z.string()` not `.url()`; coerce nullable arrays to `[]` before Drizzle writes.
- Next.js 16: `await context.params` in dynamic routes; `export const dynamic = 'force-dynamic'` on every data page.
- Auth: pages use `requireAuth()`/`requireRole()`; API routes use `getProfile()` (401 if null, 403 if `!profile.isActive`).
- All Drizzle mutations (insert/update/delete) use `.returning()`.
- Migrations are **hand-written SQL** in `drizzle/NNNN_*.sql` (drizzle-kit history is broken) with `IF NOT EXISTS` and `--> statement-breakpoint`; applied manually (dev box `node -e` with `POSTGRES_URL`, or Supabase SQL editor).
- **Single shared DB; local build/lint/tsc deadlock.** Verify by inspection; the Coolify Linux build is authoritative. ESLint `no-unused-vars` breaks the Linux build — drop unused imports, prefix intentionally-unused params with `_`.
- Status colors: `todo`=slate, `in_progress`=amber, `stuck`=red, `done`=green. Priority dot: `low`=slate, `medium`=amber, `high`=red.
- Deploy = push to `main` (Coolify auto-builds). Apply additive migrations before the deploy goes live; the rename migration is applied in tight coordination with the M1 swap (see Task 1.7).

---

# MILESTONE 1 — Rename survey "Tasks" → "Issues"

The existing `tasks` table/feature is renamed 1:1. No shape change. Intermediate commits won't fully type-check until the milestone is complete (a rename touches every reference) — that's inherent; the milestone's deliverable is verified at deploy (Task 1.7).

### Task 1.1: Write migration 0018 (rename table + enum)

**Files:**
- Create: `drizzle/0018_rename_tasks_to_issues.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Rename the survey-flagged "tasks" feature to "issues".
-- Shape is unchanged; FKs and indexes auto-follow the rename.
ALTER TABLE tasks RENAME TO issues;
--> statement-breakpoint
ALTER TYPE task_status RENAME TO issue_status;
```

- [ ] **Step 2: Do NOT apply yet** — this rename breaks the live (old) container the moment it runs, so it is applied during the M1 deploy swap (Task 1.7), not now.

- [ ] **Step 3: Commit**

```bash
git add drizzle/0018_rename_tasks_to_issues.sql
git commit -m "feat(issues): migration 0018 rename tasks->issues table + enum"
```

### Task 1.2: Rename in schema.ts

**Files:**
- Modify: `src/lib/db/schema.ts` (the `taskStatusEnum` at ~44-48, `tasks` table ~557-586, `tasksRelations` ~588-619, `Task`/`NewTask` types ~1178-1179, and `properties` relation `tasks: many(tasks)` ~138)

**Interfaces:**
- Produces: `issues` (pgTable, table name `'issues'`), `issueStatusEnum` (pgEnum `'issue_status'`), `issuesRelations`, types `Issue = typeof issues.$inferSelect`, `NewIssue = typeof issues.$inferInsert`.

- [ ] **Step 1: Rename the enum** — change the JS const and the pg name:

```ts
export const issueStatusEnum = pgEnum('issue_status', [
  'open',
  'investigating',
  'closed',
])
```

- [ ] **Step 2: Rename the table** — `export const issues = pgTable('issues', { ... })`; inside, change `status: taskStatusEnum(...)` to `status: issueStatusEnum('status').default('open').notNull()`. Leave all columns/FKs identical otherwise.

- [ ] **Step 3: Rename the relations** — `export const issuesRelations = relations(issues, ...)`; keep the relation bodies, but rename `taskAssignee`/`taskCloser` relationNames to `issueAssignee`/`issueCloser`.

- [ ] **Step 4: Update the reverse relation** on `properties` — change `tasks: many(tasks)` to `issues: many(issues)`.

- [ ] **Step 5: Rename the inferred types**:

```ts
export type Issue = typeof issues.$inferSelect
export type NewIssue = typeof issues.$inferInsert
```

- [ ] **Step 6: Verify by grep** — no remaining `taskStatusEnum`, no `pgTable('tasks'`, no `$inferSelect` named `Task` in schema.ts:

Run: `grep -nE "taskStatusEnum|pgTable\('tasks'|tasksRelations|type Task " src/lib/db/schema.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "refactor(issues): rename tasks schema -> issues"
```

### Task 1.3: Rename the queries file + update survey call sites

**Files:**
- Rename: `src/lib/db/queries/tasks.ts` → `src/lib/db/queries/issues.ts`
- Modify (imports): `src/app/api/surveys/route.ts:10,139`, `src/app/api/surveys/[id]/route.ts:11,286`

**Interfaces:**
- Produces: `createIssuesFromSubmission`, `getIssuesForAdmin(orgId, filters)`, `getIssuesForUser(userId, filters)`, `getIssueById(id)`, `updateIssueStatus(id, newStatus, closingNotes?, closedBy?)`, `IssueFilters` — all from `@/lib/db/queries/issues`. Same signatures/behavior as the old `tasks.ts`.

- [ ] **Step 1: Move the file**

```bash
git mv src/lib/db/queries/tasks.ts src/lib/db/queries/issues.ts
```

- [ ] **Step 2: Rename inside** the file — table import `tasks`→`issues`, type `NewTask`→`NewIssue`; function renames: `createTasksFromSubmission`→`createIssuesFromSubmission`, `getTasksForAdmin`→`getIssuesForAdmin`, `getTasksForUser`→`getIssuesForUser`, `getTaskById`→`getIssueById`, `updateTaskStatus`→`updateIssueStatus`, `TaskFilters`→`IssueFilters`. Replace every `tasks.` Drizzle reference with `issues.`. Keep `VALID_TRANSITIONS` and all logic identical.

- [ ] **Step 3: Update survey route imports** — in both `src/app/api/surveys/route.ts` and `src/app/api/surveys/[id]/route.ts`, change the import to `import { createIssuesFromSubmission } from '@/lib/db/queries/issues'` and the call site `createTasksFromSubmission(...)` → `createIssuesFromSubmission(...)`.

- [ ] **Step 4: Verify** no stale references remain:

Run: `grep -rnE "createTasksFromSubmission|queries/tasks'" src/`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib/db/queries src/app/api/surveys
git commit -m "refactor(issues): rename tasks queries + survey call sites"
```

### Task 1.4: Rename the API routes

**Files:**
- Rename dir: `src/app/api/tasks/` → `src/app/api/issues/` (`route.ts`, `[id]/route.ts`)

- [ ] **Step 1: Move the dir**

```bash
git mv src/app/api/tasks src/app/api/issues
```

- [ ] **Step 2: Update imports/handlers** inside both files — import from `@/lib/db/queries/issues`, use the renamed functions (`getIssuesForAdmin`, `getIssuesForUser`, `getIssueById`, `updateIssueStatus`, `IssueFilters`). Error log strings `'... /api/tasks ...'` → `'... /api/issues ...'`. Auth/staff-block/PM-property-gate logic unchanged.

- [ ] **Step 3: Verify**

Run: `grep -rnE "getTasksForAdmin|getTaskById|updateTaskStatus" src/app/api`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/api
git commit -m "refactor(issues): rename /api/tasks -> /api/issues"
```

### Task 1.5: Rename the pages

**Files:**
- Rename dir: `src/app/(portal)/tasks/` → `src/app/(portal)/issues/`
- Rename file: `issues/[taskId]/` → `issues/[issueId]/`

- [ ] **Step 1: Move**

```bash
git mv "src/app/(portal)/tasks" "src/app/(portal)/issues"
git mv "src/app/(portal)/issues/[taskId]" "src/app/(portal)/issues/[issueId]"
```

- [ ] **Step 2: Update `issues/page.tsx`** — import renamed query fns; metadata title `'Tasks | Taru Villas'`→`'Issues | Taru Villas'`; render `<IssuesPageClient>` (from `@/components/issues/issues-page-client`) with `basePath="/issues"`. Keep `requireRole(['admin','property_manager'])`.

- [ ] **Step 3: Update `issues/[issueId]/page.tsx`** — `const { issueId } = await params`; `getIssueById(issueId)`; `<IssueDetail issue={issue} backHref="/issues" />`. Keep PM property gate via `getUserProperties`.

- [ ] **Step 4: Verify**

Run: `grep -rnE "taskId|/tasks|getTaskById" "src/app/(portal)/issues"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/(portal)"
git commit -m "refactor(issues): rename /tasks pages -> /issues"
```

### Task 1.6: Rename the components + nav + breadcrumbs

**Files:**
- Rename dir: `src/components/tasks/` → `src/components/issues/`
- Rename: `tasks-page-client.tsx`→`issues-page-client.tsx`, `task-detail.tsx`→`issue-detail.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (item ~65, gating ~131-139), `src/components/layout/header.tsx` (segmentLabels ~28)

- [ ] **Step 1: Move + rename files**

```bash
git mv src/components/tasks src/components/issues
git mv src/components/issues/tasks-page-client.tsx src/components/issues/issues-page-client.tsx
git mv src/components/issues/task-detail.tsx src/components/issues/issue-detail.tsx
```

- [ ] **Step 2: Rename component identifiers** — `TasksPageClient`→`IssuesPageClient` (prop `basePath = '/issues'`), `TaskDetail`→`IssueDetail` (prop `task`→`issue`, `backHref = '/issues'`). User-facing strings: `<h1>Tasks</h1>`→`<h1>Issues</h1>`, "Back to Tasks"→"Back to Issues". Keep the survey-origin empty-state + "View Survey" link.

- [ ] **Step 3: Sidebar** — change the existing item to `{ title: 'Issues', href: '/issues', icon: AlertTriangle }` (add `AlertTriangle` to the lucide import, remove `ListTodo` only if now unused — it is reused in M2, so keep it imported). Rename `showTasksNav`→`showIssuesNav` and its filter check `item.href === '/issues'`.

- [ ] **Step 4: Breadcrumbs** — in `header.tsx` `segmentLabels`, replace `tasks: 'Tasks'` with `issues: 'Issues'`.

- [ ] **Step 5: Verify** no stale references anywhere:

Run: `grep -rnE "components/tasks|TasksPageClient|TaskDetail|'/tasks'|showTasksNav" src/`
Expected: no output (the M2 `/tasks` references don't exist yet).

- [ ] **Step 6: Commit**

```bash
git add -A src/components
git commit -m "refactor(issues): rename task components + sidebar/breadcrumbs"
```

### Task 1.7: Deploy Milestone 1 (coordinated rename)

**Files:** none (deploy + migration apply)

This is the only step with a brief crash window (a table read by the live container is being renamed). Do it during low traffic.

- [ ] **Step 1: Push** the M1 commits to `main`:

```bash
git push origin main
```

- [ ] **Step 2: Watch the Coolify build** (`http://178.105.116.19:8000`) until it is *building/deploying* (build takes a few minutes).

- [ ] **Step 3: Apply migration 0018** from the dev box just as the new container is about to swap (minimizes the window where the old container queries the now-renamed table):

```bash
node -e "import('postgres').then(async ({default:postgres})=>{const fs=require('fs');const env=fs.readFileSync('.env.local','utf8');const get=k=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]||'').replace(/^[\"']|[\"']$/g,'');const sql=postgres(get('POSTGRES_URL')||get('DATABASE_URL'),{prepare:false});await sql.unsafe(fs.readFileSync('drizzle/0018_rename_tasks_to_issues.sql','utf8'));console.log('0018 applied');await sql.end();})"
```

- [ ] **Step 4: Smoke test** on https://tvpl.morpheusds.com once the build is green:
  - `/issues` loads (admin) and lists existing issues.
  - Open an issue → "View Survey" link works; status controls work.
  - Submit a survey with a ≤6 score + issue description → a new Issue appears.
  - Staff account: `/issues` is blocked.

- [ ] **Step 5: Update memory** — note latest applied migration is **0018** and the tasks→issues rename shipped.

---

# MILESTONE 2 — New employee "Tasks" tool

Additive only. Migration 0019 creates new tables (breaks nothing live), so it's applied **before** the M2 deploy per the normal apply-before-merge rule.

### Task 2.1: Migration 0019 + schema additions

**Files:**
- Create: `drizzle/0019_employee_tasks.sql`
- Modify: `src/lib/db/schema.ts` (append new enums, tables, relations, types)

**Interfaces:**
- Produces: `taskStatusEnum` (pgEnum `'task_status'` = todo|in_progress|stuck|done), `taskPriorityEnum` (`'task_priority'` = low|medium|high), tables `taskTeams`, `tasks`, `taskAssignees`, `taskTeamLinks`; relations; types `Task`/`NewTask`, `TaskTeam`/`NewTaskTeam`, `TaskAssignee`/`NewTaskAssignee`, `TaskTeamLink`/`NewTaskTeamLink`.

- [ ] **Step 1: Write the migration**

```sql
CREATE TYPE task_status AS ENUM ('todo','in_progress','stuck','done');
--> statement-breakpoint
CREATE TYPE task_priority AS ENUM ('low','medium','high');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_teams_org_name_unique UNIQUE (org_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL,
  description text,
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  due_date date,
  start_date date,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT task_assignees_pk UNIQUE (task_id, profile_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_team_links (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES task_teams(id) ON DELETE CASCADE,
  CONSTRAINT task_team_links_pk UNIQUE (task_id, team_id)
);
```

- [ ] **Step 2: Append to schema.ts** — enums:

```ts
export const taskStatusEnum = pgEnum('task_status', ['todo','in_progress','stuck','done'])
export const taskPriorityEnum = pgEnum('task_priority', ['low','medium','high'])
```

- [ ] **Step 3: Append the tables** (Drizzle camelCase):

```ts
export const taskTeams = pgTable('task_teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique('task_teams_org_name_unique').on(t.orgId, t.name)])

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').default('todo').notNull(),
  priority: taskPriorityEnum('priority').default('medium').notNull(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  startDate: date('start_date'),
  position: integer('position').default(0).notNull(),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const taskAssignees = pgTable('task_assignees', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
}, (t) => [unique('task_assignees_pk').on(t.taskId, t.profileId)])

export const taskTeamLinks = pgTable('task_team_links', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').notNull().references(() => taskTeams.id, { onDelete: 'cascade' }),
}, (t) => [unique('task_team_links_pk').on(t.taskId, t.teamId)])
```

Ensure `date` is in the `drizzle-orm/pg-core` import list at the top of schema.ts (add it if missing — `varchar`, `integer`, `text`, `uuid`, `timestamp`, `unique`, `pgEnum` are already imported).

- [ ] **Step 4: Append relations + types**:

```ts
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organization: one(organizations, { fields: [tasks.orgId], references: [organizations.id] }),
  property: one(properties, { fields: [tasks.propertyId], references: [properties.id] }),
  creator: one(profiles, { fields: [tasks.createdBy], references: [profiles.id] }),
  assignees: many(taskAssignees),
  teamLinks: many(taskTeamLinks),
}))
export const taskTeamsRelations = relations(taskTeams, ({ many }) => ({ links: many(taskTeamLinks) }))
export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  profile: one(profiles, { fields: [taskAssignees.profileId], references: [profiles.id] }),
}))
export const taskTeamLinksRelations = relations(taskTeamLinks, ({ one }) => ({
  task: one(tasks, { fields: [taskTeamLinks.taskId], references: [tasks.id] }),
  team: one(taskTeams, { fields: [taskTeamLinks.teamId], references: [taskTeams.id] }),
}))

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TaskTeam = typeof taskTeams.$inferSelect
export type NewTaskTeam = typeof taskTeams.$inferInsert
```

- [ ] **Step 5: Apply migration 0019** (additive, safe to apply now):

```bash
node -e "import('postgres').then(async ({default:postgres})=>{const fs=require('fs');const env=fs.readFileSync('.env.local','utf8');const get=k=>(env.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]||'').replace(/^[\"']|[\"']$/g,'');const sql=postgres(get('POSTGRES_URL')||get('DATABASE_URL'),{prepare:false});await sql.unsafe(fs.readFileSync('drizzle/0019_employee_tasks.sql','utf8'));console.log('0019 applied');await sql.end();})"
```

Expected: `0019 applied`.

- [ ] **Step 6: Commit**

```bash
git add drizzle/0019_employee_tasks.sql src/lib/db/schema.ts
git commit -m "feat(tasks): migration 0019 + schema for employee tasks"
```

### Task 2.2: Queries — `src/lib/db/queries/tasks.ts`

**Files:**
- Create: `src/lib/db/queries/tasks.ts`

**Interfaces:**
- Consumes: `tasks, taskTeams, taskAssignees, taskTeamLinks, properties, profiles` from schema.
- Produces:
  - `TaskFilters = { propertyId?, status?, teamId?, priority?, assigneeId?, search? }`
  - `TaskWithRelations` = task row + `propertyName: string|null`, `assignees: {id,fullName}[]`, `teams: {id,name}[]`
  - `getTasks(orgId: string, filters?: TaskFilters): Promise<TaskWithRelations[]>`
  - `getTaskById(id: string): Promise<TaskWithRelations | null>`
  - `createTask(data: NewTask, assigneeIds: string[], teamIds: string[]): Promise<Task>`
  - `updateTask(id: string, data: Partial<NewTask>, assigneeIds?: string[], teamIds?: string[]): Promise<Task>`
  - `deleteTask(id: string): Promise<Task | undefined>`
  - `reorderTask(id: string, status: 'todo'|'in_progress'|'stuck'|'done', position: number): Promise<Task>`
  - `getTaskTeams(orgId: string): Promise<TaskTeam[]>`
  - `createTaskTeam(orgId: string, name: string, sortOrder?: number): Promise<TaskTeam>`
  - `updateTaskTeam(id: string, data: { name?: string; sortOrder?: number }): Promise<TaskTeam>`
  - `deleteTaskTeam(id: string): Promise<TaskTeam | undefined>`

- [ ] **Step 1: Write the file**

```ts
import { eq, and, asc, desc, ilike, inArray, sql } from 'drizzle-orm'
import { db } from '..'
import {
  tasks, taskTeams, taskAssignees, taskTeamLinks, properties, profiles,
  type Task, type NewTask, type TaskTeam,
} from '../schema'

export interface TaskFilters {
  propertyId?: string
  status?: 'todo' | 'in_progress' | 'stuck' | 'done'
  teamId?: string
  priority?: 'low' | 'medium' | 'high'
  assigneeId?: string
  search?: string
}

export interface TaskWithRelations extends Task {
  propertyName: string | null
  assignees: { id: string; fullName: string }[]
  teams: { id: string; name: string }[]
}

async function hydrate(rows: Task[]): Promise<TaskWithRelations[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const propIds = Array.from(new Set(rows.map((r) => r.propertyId).filter(Boolean))) as string[]

  const [assigneeRows, teamRows, propRows] = await Promise.all([
    db.select({ taskId: taskAssignees.taskId, id: profiles.id, fullName: profiles.fullName })
      .from(taskAssignees)
      .innerJoin(profiles, eq(taskAssignees.profileId, profiles.id))
      .where(inArray(taskAssignees.taskId, ids)),
    db.select({ taskId: taskTeamLinks.taskId, id: taskTeams.id, name: taskTeams.name })
      .from(taskTeamLinks)
      .innerJoin(taskTeams, eq(taskTeamLinks.teamId, taskTeams.id))
      .where(inArray(taskTeamLinks.taskId, ids)),
    propIds.length
      ? db.select({ id: properties.id, name: properties.name }).from(properties).where(inArray(properties.id, propIds))
      : Promise.resolve([] as { id: string; name: string }[]),
  ])

  const aByTask = new Map<string, { id: string; fullName: string }[]>()
  for (const a of assigneeRows) {
    const arr = aByTask.get(a.taskId) ?? []
    arr.push({ id: a.id, fullName: a.fullName }); aByTask.set(a.taskId, arr)
  }
  const tByTask = new Map<string, { id: string; name: string }[]>()
  for (const t of teamRows) {
    const arr = tByTask.get(t.taskId) ?? []
    arr.push({ id: t.id, name: t.name }); tByTask.set(t.taskId, arr)
  }
  const propName = new Map(propRows.map((p) => [p.id, p.name]))

  return rows.map((r) => ({
    ...r,
    propertyName: r.propertyId ? propName.get(r.propertyId) ?? null : null,
    assignees: aByTask.get(r.id) ?? [],
    teams: tByTask.get(r.id) ?? [],
  }))
}

export async function getTasks(orgId: string, filters: TaskFilters = {}): Promise<TaskWithRelations[]> {
  const conditions = [eq(tasks.orgId, orgId)]
  if (filters.propertyId) conditions.push(eq(tasks.propertyId, filters.propertyId))
  if (filters.status) conditions.push(eq(tasks.status, filters.status))
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority))
  if (filters.search) conditions.push(ilike(tasks.title, `%${filters.search}%`))

  // team/assignee filters require a membership subquery
  if (filters.teamId) {
    conditions.push(sql`exists (select 1 from task_team_links ttl where ttl.task_id = ${tasks.id} and ttl.team_id = ${filters.teamId})`)
  }
  if (filters.assigneeId) {
    conditions.push(sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.profile_id = ${filters.assigneeId})`)
  }

  const rows = await db.select().from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.status), asc(tasks.position), desc(tasks.createdAt))
  return hydrate(rows)
}

export async function getTaskById(id: string): Promise<TaskWithRelations | null> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!rows[0]) return null
  const [h] = await hydrate(rows)
  return h
}

export async function createTask(data: NewTask, assigneeIds: string[], teamIds: string[]): Promise<Task> {
  return db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values(data).returning()
    if (assigneeIds.length)
      await tx.insert(taskAssignees).values(assigneeIds.map((profileId) => ({ taskId: task.id, profileId })))
    if (teamIds.length)
      await tx.insert(taskTeamLinks).values(teamIds.map((teamId) => ({ taskId: task.id, teamId })))
    return task
  })
}

export async function updateTask(
  id: string, data: Partial<NewTask>, assigneeIds?: string[], teamIds?: string[],
): Promise<Task> {
  return db.transaction(async (tx) => {
    const set: Partial<NewTask> = { ...data, updatedAt: new Date() }
    if (data.status !== undefined) {
      set.completedAt = data.status === 'done' ? new Date() : null
    }
    const [task] = await tx.update(tasks).set(set).where(eq(tasks.id, id)).returning()
    if (assigneeIds) {
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id))
      if (assigneeIds.length)
        await tx.insert(taskAssignees).values(assigneeIds.map((profileId) => ({ taskId: id, profileId })))
    }
    if (teamIds) {
      await tx.delete(taskTeamLinks).where(eq(taskTeamLinks.taskId, id))
      if (teamIds.length)
        await tx.insert(taskTeamLinks).values(teamIds.map((teamId) => ({ taskId: id, teamId })))
    }
    return task
  })
}

export async function deleteTask(id: string): Promise<Task | undefined> {
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning()
  return deleted
}

export async function reorderTask(
  id: string, status: 'todo' | 'in_progress' | 'stuck' | 'done', position: number,
): Promise<Task> {
  const [task] = await db.update(tasks)
    .set({ status, position, completedAt: status === 'done' ? new Date() : null, updatedAt: new Date() })
    .where(eq(tasks.id, id)).returning()
  return task
}

export async function getTaskTeams(orgId: string): Promise<TaskTeam[]> {
  return db.select().from(taskTeams).where(eq(taskTeams.orgId, orgId))
    .orderBy(asc(taskTeams.sortOrder), asc(taskTeams.name))
}

export async function createTaskTeam(orgId: string, name: string, sortOrder = 0): Promise<TaskTeam> {
  const [t] = await db.insert(taskTeams).values({ orgId, name, sortOrder }).returning()
  return t
}

export async function updateTaskTeam(id: string, data: { name?: string; sortOrder?: number }): Promise<TaskTeam> {
  const [t] = await db.update(taskTeams).set({ ...data, updatedAt: new Date() }).where(eq(taskTeams.id, id)).returning()
  return t
}

export async function deleteTaskTeam(id: string): Promise<TaskTeam | undefined> {
  const [t] = await db.delete(taskTeams).where(eq(taskTeams.id, id)).returning()
  return t
}
```

- [ ] **Step 2: Verify** imports resolve (grep the named exports from schema exist):

Run: `grep -nE "export const (tasks|taskTeams|taskAssignees|taskTeamLinks) =" src/lib/db/schema.ts`
Expected: all four present.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/tasks.ts
git commit -m "feat(tasks): queries for employee tasks + teams"
```

### Task 2.3: API — tasks list/create + item + reorder

**Files:**
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`
- Create: `src/app/api/tasks/[id]/reorder/route.ts`

**Interfaces:**
- Consumes: query fns from Task 2.2; `getProfile` from `@/lib/auth/guards`.
- Produces: REST endpoints documented in the spec (collaborative create/edit; delete = creator or admin).

- [ ] **Step 1: `route.ts`** (list + create)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTasks, createTask, type TaskFilters } from '@/lib/db/queries/tasks'

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  propertyId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).nullable().optional(),
  teamIds: z.array(z.string().uuid()).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const sp = new URL(request.url).searchParams
    const filters: TaskFilters = {
      propertyId: sp.get('propertyId') || undefined,
      status: (sp.get('status') as TaskFilters['status']) || undefined,
      teamId: sp.get('teamId') || undefined,
      priority: (sp.get('priority') as TaskFilters['priority']) || undefined,
      assigneeId: sp.get('assigneeId') || undefined,
      search: sp.get('search') || undefined,
    }
    const items = await getTasks(profile.orgId, filters)
    return NextResponse.json(items)
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const { assigneeIds, teamIds, ...fields } = parsed.data
    const task = await createTask(
      { ...fields, orgId: profile.orgId, createdBy: profile.id, dueDate: fields.dueDate ?? null, propertyId: fields.propertyId ?? null },
      assigneeIds ?? [], teamIds ?? [],
    )
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('POST /api/tasks error:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
```

- [ ] **Step 2: `[id]/route.ts`** (get + patch + delete; delete gated to creator/admin)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTaskById, updateTask, deleteTask } from '@/lib/db/queries/tasks'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  propertyId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).nullable().optional(),
  teamIds: z.array(z.string().uuid()).nullable().optional(),
})

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await context.params
    const task = await getTaskById(id)
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(task)
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const { assigneeIds, teamIds, dueDate, propertyId, ...rest } = parsed.data
    const data = { ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ?? null } : {}),
      ...(propertyId !== undefined ? { propertyId: propertyId ?? null } : {}) }
    const task = await updateTask(id, data, assigneeIds ?? undefined, teamIds ?? undefined)
    return NextResponse.json(task)
  } catch (error) {
    console.error('PATCH /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await context.params
    const task = await getTaskById(id)
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (profile.role !== 'admin' && task.createdBy !== profile.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const deleted = await deleteTask(id)
    return NextResponse.json(deleted)
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
```

- [ ] **Step 3: `[id]/reorder/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { reorderTask } from '@/lib/db/queries/tasks'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']),
  position: z.number().int().min(0),
})

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    const task = await reorderTask(id, parsed.data.status, parsed.data.position)
    return NextResponse.json(task)
  } catch (error) {
    console.error('PATCH /api/tasks/[id]/reorder error:', error)
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Confirm `profile` shape** — grep that `getProfile()` returns `id`, `orgId`, `role`, `isActive`:

Run: `grep -nE "isActive|orgId|role|id:" src/lib/auth/guards.ts | head`
Expected: these fields exist on the profile object (adjust `!profile.isActive` to the actual field name if it differs, e.g. `profile.status`).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks
git commit -m "feat(tasks): REST API for tasks (list/create/get/patch/delete/reorder)"
```

### Task 2.4: API — teams CRUD (admin)

**Files:**
- Create: `src/app/api/tasks/teams/route.ts`
- Create: `src/app/api/tasks/teams/[id]/route.ts`

- [ ] **Step 1: `teams/route.ts`** — `GET` (any active user) returns `getTaskTeams(profile.orgId)`; `POST` (admin only — `if (profile.role !== 'admin') return 403`) validates `{ name: z.string().min(1), sortOrder: z.number().int().optional() }`, calls `createTaskTeam(profile.orgId, name, sortOrder)`, returns 201. On Postgres unique violation (`error.code === '23505'`) return `{ error: 'A team with that name already exists' }` 409.

- [ ] **Step 2: `teams/[id]/route.ts`** — `PATCH` (admin) validates `{ name?: string.min(1), sortOrder?: int }` → `updateTaskTeam`; `DELETE` (admin) → `deleteTaskTeam`. Both `await context.params`. Same 23505→409 handling on PATCH.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/teams
git commit -m "feat(tasks): admin-managed teams CRUD API"
```

### Task 2.5: UI helpers + task card

**Files:**
- Create: `src/components/tasks/task-meta.tsx` (shared status/priority constants + small presentational bits)
- Create: `src/components/tasks/task-card.tsx`

**Interfaces:**
- Produces: `STATUS_META` (`Record<status, {label, column, badge, dot}>`), `PRIORITY_META` (`Record<priority, {label, dot}>`), `StatusBadge`, `PriorityDot`, `TeamChips`, `AssigneeAvatars`; `<TaskCard task draggable? onClick />`.
- Consumes: `TaskWithRelations` from `@/lib/db/queries/tasks`.

- [ ] **Step 1: `task-meta.tsx`**

```tsx
'use client'
import { Badge } from '@/components/ui/badge'

export const STATUSES = ['todo', 'in_progress', 'stuck', 'done'] as const
export type TaskStatus = (typeof STATUSES)[number]

export const STATUS_META: Record<TaskStatus, { label: string; badge: string; dot: string }> = {
  todo:        { label: 'To Do',       badge: 'bg-slate-100 text-slate-700',  dot: 'bg-slate-400' },
  in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-500' },
  stuck:       { label: 'Stuck',       badge: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  done:        { label: 'Done',        badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof PRIORITIES)[number]
export const PRIORITY_META: Record<TaskPriority, { label: string; dot: string }> = {
  low:    { label: 'Low',    dot: 'bg-slate-400' },
  medium: { label: 'Medium', dot: 'bg-amber-500' },
  high:   { label: 'High',   dot: 'bg-red-500' },
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status]
  return <Badge className={`${m.badge} border-0`}>{m.label}</Badge>
}
export function PriorityDot({ priority }: { priority: TaskPriority }) {
  const m = PRIORITY_META[priority]
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
    <span className={`size-2 rounded-full ${m.dot}`} />{m.label}
  </span>
}
```

- [ ] **Step 2: `task-card.tsx`** — presentational card used by the board. Shows title, `TeamChips` (small muted badges), assignee initials avatars (or "Unassigned"), due date (date-fns `format(new Date(dueDate), 'd MMM')`), and `PriorityDot`. Accepts `draggable`, `onDragStart`, `onClick`. Mirror the visual density of `src/components/issues/issues-page-client.tsx` cards.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/task-meta.tsx src/components/tasks/task-card.tsx
git commit -m "feat(tasks): status/priority meta + task card"
```

### Task 2.6: Task form dialog

**Files:**
- Create: `src/components/tasks/task-form-dialog.tsx`

**Interfaces:**
- Consumes: `TaskWithRelations`; props `{ open, onOpenChange, task?: TaskWithRelations | null, properties: {id,name}[], teams: {id,name}[], users: {id,fullName}[], onSaved: () => void }`.
- Produces: a create/edit dialog that POSTs `/api/tasks` or PATCHes `/api/tasks/[id]`.

- [ ] **Step 1: Build the dialog** — React Hook Form. Fields: `title` (Input, required), `description` (Textarea), `status` (Select of STATUSES), `priority` (Select of PRIORITIES), `propertyId` (Select incl. an explicit "None" → null), `dueDate` (Input type=date), `assigneeIds` (multi-select — use a checkbox list inside a Popover, or a simple multi `Select`; mirror the multi-team pattern), `teamIds` (multi-select of teams). On submit, build the JSON body (`assigneeIds`, `teamIds` arrays; empty `dueDate`/`propertyId` → null), `fetch` with POST or PATCH, `toast.success`, call `onSaved()`, `router.refresh()`. Disable submit while pending. Mirror the create/edit dialog conventions in `src/components/admin` and the shadcn `DialogContent`. Include a Delete button in edit mode that calls `DELETE /api/tasks/[id]` and is shown only when `task.createdBy === currentUserId || isAdmin` (pass `canDelete` prop from the page client).

- [ ] **Step 2: Commit**

```bash
git add src/components/tasks/task-form-dialog.tsx
git commit -m "feat(tasks): create/edit task dialog"
```

### Task 2.7: Board view (native drag-and-drop)

**Files:**
- Create: `src/components/tasks/task-board.tsx`

**Interfaces:**
- Consumes: `TaskWithRelations[]`, `TaskCard`, `STATUSES`/`STATUS_META`; props `{ tasks, onEdit: (t) => void }`.
- Produces: 4-column kanban; on drop, PATCH `/api/tasks/[id]/reorder` then `router.refresh()`.

- [ ] **Step 1: Build the board**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { STATUSES, STATUS_META, type TaskStatus } from './task-meta'
import { TaskCard } from './task-card'
import type { TaskWithRelations } from '@/lib/db/queries/tasks'

export function TaskBoard({ tasks, onEdit }: { tasks: TaskWithRelations[]; onEdit: (t: TaskWithRelations) => void }) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)

  async function drop(status: TaskStatus) {
    const id = dragId
    setDragId(null); setOverCol(null)
    if (!id) return
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === status) return
    const position = tasks.filter((t) => t.status === status).length
    try {
      const res = await fetch(`/api/tasks/${id}/reorder`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, position }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      toast.error('Could not move task')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATUSES.map((status) => {
        const col = tasks.filter((t) => t.status === status)
        return (
          <div key={status}
            onDragOver={(e) => { e.preventDefault(); setOverCol(status) }}
            onDrop={() => drop(status)}
            className={`flex min-h-24 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors ${overCol === status ? 'ring-2 ring-primary/40' : ''}`}>
            <div className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
              <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
              {STATUS_META[status].label}
              <span className="ml-auto text-xs text-muted-foreground">{col.length}</span>
            </div>
            {col.map((t) => (
              <TaskCard key={t.id} task={t} draggable
                onDragStart={() => setDragId(t.id)} onClick={() => onEdit(t)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tasks/task-board.tsx
git commit -m "feat(tasks): kanban board with native drag-and-drop"
```

### Task 2.8: List view

**Files:**
- Create: `src/components/tasks/task-list.tsx`

**Interfaces:**
- Consumes: `TaskWithRelations[]`, meta helpers; props `{ tasks, onEdit }`.
- Produces: a filterable table.

- [ ] **Step 1: Build the table** — columns: Title, Teams (chips), Assignees (initials/"Unassigned"), Property (`propertyName ?? '—'`), Priority (`PriorityDot`), Status (`StatusBadge`), Due (`format(...,'d MMM yyyy')` or '—'). Row `onClick={() => onEdit(task)}`. Use the same shadcn `Table` styling as `issues-page-client.tsx`. (Filtering lives in the page client, Task 2.9 — this component just renders rows it's given.)

- [ ] **Step 2: Commit**

```bash
git add src/components/tasks/task-list.tsx
git commit -m "feat(tasks): list/table view"
```

### Task 2.9: Page client (toggle + filters + dialog) + area tabs

**Files:**
- Create: `src/components/tasks/tasks-page-client.tsx`
- Create: `src/components/tasks/tasks-area-tabs.tsx`

**Interfaces:**
- Consumes: `TaskBoard`, `TaskList`, `TaskFormDialog`, meta; props `{ tasks, properties, teams, users, currentUserId, isAdmin }`.
- Produces: the `/tasks` page UI.

- [ ] **Step 1: `tasks-area-tabs.tsx`** — nav-style tabs (Link + usePathname), mirroring `src/components/sops/sops-area-tabs.tsx`: "Tasks" → `/tasks` (all roles); "Teams" → `/tasks/teams` (admin only). If only one tab is visible, hide the bar.

- [ ] **Step 2: `tasks-page-client.tsx`** — `'use client'`. nuqs `useQueryState('view', { defaultValue: 'board' })` for Board⇄List toggle (a small segmented control). A filter bar (search Input, property/team/status/priority/assignee Selects) that filters the in-memory `tasks` array client-side (server already returns the org list). A "New Task" button opens `<TaskFormDialog>` with `task={null}`. Clicking a card/row opens the dialog with that task. Pass `canDelete = isAdmin || task.createdBy === currentUserId` to the dialog. Header: `<h1>Tasks</h1>` + subtitle "Plan and track work across the team". Render `<TasksAreaTabs isAdmin={isAdmin} />` above the content. Empty state mirrors the issues empty-state pattern.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/tasks-page-client.tsx src/components/tasks/tasks-area-tabs.tsx
git commit -m "feat(tasks): page client (board/list toggle, filters, dialog) + tabs"
```

### Task 2.10: Pages — /tasks and /tasks/teams

**Files:**
- Create: `src/app/(portal)/tasks/page.tsx`
- Create: `src/app/(portal)/tasks/teams/page.tsx`
- Create: `src/components/tasks/task-teams-client.tsx`

- [ ] **Step 1: `tasks/page.tsx`**

```tsx
import { requireAuth } from '@/lib/auth/guards'
import { getTasks, getTaskTeams } from '@/lib/db/queries/tasks'
import { getAllProperties } from '@/lib/db/queries/properties'
import { getOrgProfiles } from '@/lib/db/queries/profiles'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const profile = await requireAuth()
  if (!profile) return null
  const [tasks, teams, properties, users] = await Promise.all([
    getTasks(profile.orgId),
    getTaskTeams(profile.orgId),
    getAllProperties(profile.orgId),
    getOrgProfiles(profile.orgId),
  ])
  return (
    <TasksPageClient
      tasks={tasks}
      teams={teams}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
      currentUserId={profile.id}
      isAdmin={profile.role === 'admin'}
    />
  )
}
```

Confirm the exact names of the "all properties for org" and "all profiles for org" query fns first:
Run: `grep -rnE "export async function (getAllProperties|getOrgProfiles|getProfilesForOrg|getAllProfiles)" src/lib/db/queries`
Use whatever exists (the issues `page.tsx` already imports an all-properties fn — reuse the same one; for users, reuse whatever the admin Users page uses). Adjust imports/`.map` field names accordingly.

- [ ] **Step 2: `tasks/teams/page.tsx`** — `requireRole(['admin'])`, `force-dynamic`, load `getTaskTeams(profile.orgId)`, render `<TaskTeamsClient teams={teams} />`.

- [ ] **Step 3: `task-teams-client.tsx`** — admin CRUD list mirroring `src/components/sops/sop-categories` (or the SOP categories client): list teams with edit/delete, an "Add team" inline form (POST `/api/tasks/teams`), edit (PATCH), delete (AlertDialog → DELETE). `toast` + `router.refresh()`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(portal)/tasks" src/components/tasks/task-teams-client.tsx
git commit -m "feat(tasks): /tasks and /tasks/teams pages + teams admin client"
```

### Task 2.11: Navigation + breadcrumbs

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/header.tsx`

- [ ] **Step 1: Sidebar** — add to `mainNavItems`: `{ title: 'Tasks', href: '/tasks', icon: ListTodo }` (placed right after Issues). It must be visible to **all roles**, so it is NOT added to any gating filter (the `visibleMainNavItems` filter only special-cases `/dashboard` and `/issues`; `/tasks` falls through to `return true`).

- [ ] **Step 2: Breadcrumbs** — in `header.tsx` `segmentLabels`, add `tasks: 'Tasks'` and `teams: 'Teams'`.

- [ ] **Step 3: Verify**

Run: `grep -nE "href: '/tasks'|tasks: 'Tasks'|teams: 'Teams'" src/components/layout/*.tsx`
Expected: all three present.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout
git commit -m "feat(tasks): sidebar Tasks item + breadcrumbs"
```

### Task 2.12: Deploy Milestone 2

**Files:** none

- [ ] **Step 1: Confirm 0019 already applied** (Task 2.1 Step 5). If not, apply it now (additive, safe).

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Watch Coolify build to green.** If it fails, it'll be ESLint unused-vars or a type mismatch — fix forward.

- [ ] **Step 4: Smoke test** on https://tvpl.morpheusds.com:
  - `/tasks` loads for admin, PM, and **staff**.
  - Create a task (title only) → appears in To Do.
  - Drag it to In Progress / Stuck / Done → status persists on refresh; Done sets completedAt.
  - Edit a task: set priority, due date, property, assignees, teams → persists.
  - Switch Board⇄List; filters work.
  - As admin, `/tasks/teams`: add a team → appears in the task dialog dropdown.
  - As staff, `/tasks/teams` is not reachable (no tab / redirect).
  - Delete: a non-creator non-admin cannot delete someone else's task.

---

# MILESTONE 3 — Seed the Implementation Tracker

### Task 3.1: Seed script

**Files:**
- Create: `scripts/seed-implementation-tracker.mjs`

**Interfaces:**
- Standalone node script (run with `node`), reads `POSTGRES_URL` from `.env.local`, inserts teams (idempotent on name) + tasks with team links. Assignees empty.

- [ ] **Step 1: Write the script** — it (a) resolves `orgId` + an admin `createdBy` from the DB, (b) upserts the 15 teams, (c) parses the embedded `ROWS` array, (d) inserts tasks + `task_team_links`. Deadline parser: `"DD. Month"`→`2026-MM-DD`, months already past as of 2026-06-12 roll to 2027 (only "March" here), `"Immediate"/"Immeditate"`→null. Status map: `Pending→todo`, `In Progress→in_progress`, `Completed→done`. Description = `detail` + (updates ? `\n\nUpdates: ${updates}` : ''). Teams split on `/`, `,`, `&` and trimmed; map raw token → canonical team name (e.g. `Media`, `Naturalists`, `CEO`, `Marketing` are their own teams).

```js
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] || '').replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })

const TEAMS = ['Operations','Interior','Housekeeping','Culinary','Naturalists','Activities','Engineer','Purchase','Finance','HR','General','MS Creatives','Media','CEO','Marketing']

const MONTHS = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 }
function parseDeadline(s) {
  if (!s) return null
  const t = s.trim().toLowerCase()
  if (t.startsWith('immed')) return null
  const m = t.match(/^(\d{1,2})\.\s*([a-z]+)/)
  if (!m) return null
  const day = +m[1], mon = MONTHS[m[2]]
  if (!mon) return null
  const year = mon < 6 ? 2027 : 2026 // tracker dated 2026-06-12; earlier months roll forward
  return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}
const STATUS = { 'pending':'todo','in progress':'in_progress','completed':'done' }
function splitTeams(raw) {
  return raw.split(/[\/,&]/).map((x) => x.trim()).filter(Boolean).map((tok) => {
    const hit = TEAMS.find((tm) => tm.toLowerCase() === tok.toLowerCase())
    return hit || tok // unknown tokens kept verbatim; will be created as a team
  })
}

// [title, detail, updates, deadline, responsible, status]
const ROWS = [
  ['BOP Service/F&B','Full Service BOP including Stocktakes, Inventory rotation, Butlers duties, Service, Dietaries','From Scratch - starting at Long House/Rampart Street - first draft to be finalized for review','10. July','Operations','In Progress'],
  ['Styling Guide Service','Styling Guide of all Bar areas; Storage areas; Table Setups;','From Scratch - starting at Long House/Rampart Street','10. July','Interior / Operations','In Progress'],
  ['BOP Housekeeping','Share Room Orientation document to be included into BOP','First draft to be shared with Steph','10. July','Housekeeping','Pending'],
  ['BOP Housekeeping','General BOP for Housekeeping area including all details as per frame work','First draft has been shared, needs a lot of changes and add ons - Steph to share a more detailed review','15. September','Housekeeping','In Progress'],
  ['BOP Collateral','Full Collateral BOP to be worked into the Houskeeping BOP','Senarath to take pictures once implemented and share for overall BOP and Styling','15. September','Housekeeping','In Progress'],
  ['BOP Housekeeping','Share list of how to clean what to be included into BOP','Senarath to share a full list with how to clean what - brass, rugs, windows, ceramic, wood etc.','10. July','Housekeeping','Pending'],
  ['Laundry List','Sort out laundry list as a beautifully designed clipboard / and on QR code','sample idea shared - Purchase to get physical sample to finalize / Senarath to work on finalizing list','10. July','Housekeeping','In Progress'],
  ['Signage Guest Areas','No smoking sign and wet floor sign needs to be replaced - so long taken out of the rooms','sample idea shared - to be signed off in collateral meeting','10. July','Interior','In Progress'],
  ['Collateral','Finalizing all collateral in the room - discussion was held to go with 1 x QR code for everything?','Discussions were had at Long House between Interior, HK and MS Creatives (General) - to be presented and finalized 3-5th July in Colombo','10. July','CEO, Marketing','In Progress'],
  ['Music in Main areas','Create and share playlists for each property','Sabreena to share playlists with Steph for final discussion and implementation','15. September','Interior','Pending'],
  ['Internal Communication','Overall Process for communication of Executive Teams, Property Management and deliverables','Draft to be shared by General and Wathsala; Steph to include into BOP','15. September','HR/General','Pending'],
  ['Phones','Overall BOP for phones in the room and the How to','Memo shared by Alvin & Wathsala - ALL Senior team to implement and Follow up - Steph to include into training and BOP','15. September','General','In Progress'],
  ['Taru Villas Way','Finalize 12 Behaviors - the Taru Way','To be shared as a 1 pager and included in mission training. Steph to share a draft','10. July','MS Creatives','In Progress'],
  ['Budget','FF&E Budget to be reviewed including items for the rooms such as toilet roll covers, rings for','Sabreena to share detailed lists with Alvin for sign off','15. September','Interior','In Progress'],
  ['Standard Setup / Styling Guide','Styling Guide of all Main Areas and Room areas for each Lodge','Already started - Senarath to finish Villu and share for final review - roll out to all other Lodges until September / Steph to share pictures for Rampart and Long House','10. July','Housekeeping','In Progress'],
  ['BOP Kitchen','Chef to review Kitchen BOP, including but not limited to: Dietaries, Hygiene, Food identities, Kitchen Flow, How to cleaning and using, Menu presenting to guests, Do’s and Don’ts, Store Rooms (Fridges, Freezers etc.)','Recipe cards are already in Place - make sure there are copies in all Lodges; Send BOP draft to Steph for review and overall completion - please send pictures of Kitchen areas, Store rooms etc. for inserting into BOP - Steph to share some pictures from Long House & Rampart','15. September','Culinary','In Progress'],
  ['Menu Activites','review the bento box menues and general bush menus','Markus and Steph can share some ideas - please specify if you need any more equipment.','31. July','Culinary','In Progress'],
  ['Food Concept Ahangama','Health offerings Ahangama','Markus and Steph to share some ideas of theatrical food concept for Chef to give full feedback and discussions before','31. July','Culinary','In Progress'],
  ['Bush Equipment & Hot Box implementation','For Game Drives & Walks only review of equipment for 2026','Villu & Habarana','31. July','Culinary, Naturalists','Pending'],
  ['BBQ Setups','Review equipment and implement','Start with Kandy and Long House - MS to make suggestion for Villu as per request','31. July','Culinary','In Progress'],
  ['Festive Season Menu','To be planned for all properties','Please share with Markus and Steph','15. August','Culinary','Pending'],
  ['Destination Dining','Share ideas for destination dining for all properties with Markus and Steph','Kandy Royal Feast to be implemented!','30. June','Culinary','In Progress'],
  ['Culinary Photo Shoots','All Properties to be completed urgently','Social Media Team has started with SLH properties - others to follow','30. June','Culinary & Media','In Progress'],
  ['Mawella Croc & Cut','Full Crockery and Cutlery Change for Mawella','Include Outdoor Beach Dinners - we do not need any platforms and over complications on the beach - keep it simple and authentic','31. October','Culinary','Pending'],
  ['2027 Menu Tweaks','Full Menu review and roll out plan for 2027','Steph & Markus can give some feedback until end of August to include 1 x destination dining for each property','30. September','Culinary','Pending'],
  ['Kitchen Hygiene & Safety','Certification for all Lodges to be done','Full Training to be included with the Certifications - start training of Dietaries for now - please share details with Steph for BOP','31. March','Culinary & Operations','Pending'],
  ['BOP Uniform and Behaviors','BOP for General Grooming, Uniform (including pictures) and the Taru Villas Way','Basic reference already in Place - General and Wathsala to review and share with Steph for finalization','15. September','HR','Pending'],
  ['BOP Activities','Basic picnics, Baskets for each activity','Cheat sheets for each Activity - Celine to share a simple format - this will be consolitated into an activities BOP','15. September','Activities','Pending'],
  ['BOP Drivers','Full BOP for Driver’s, Pick ups, Vehicle standards etc.','From Scratch - Meeting in Colombo Markus & Head of Security with Wathsala','10. July','Operations','Pending'],
  ['BOP Maintenance','Preventative Maintenance BOP; Purchasing Process; Manager’s full review on "how to"','Engineer to share details with Steph for first draft - Hasitha please share','10. July','Engineer','Pending'],
  ['BOP Taru Villas Managers','Job description, Administration, Do’s and Don’ts, Check in, Daily/Weekly/Monthly','Wathsala please share current Job discription for Property Managers // Senarath to share property walk about document // Steph to share Orientation - draft for review to be completed before MS is leaving','10. July','MS Creatives','Pending'],
  ['Coffee Quality','Servicing of Machines and Coffee Training / take the plunger out of the room','Start with Long House and Rampart','10. July','MS Creatives','Pending'],
  ['Buyer’s Guide','Full list (in new system) including all area details in terms of purchase','Send list to Steph with all details to review - priority on Linen / quality needs to be signed off by culinary, operations, MS Creatives','15. September','Purchase','Pending'],
  ['Asset Registers','Full Asset register for each Lodge including suppliers; pictures and re-ordering details','Long House started and to be completed; Rampart started and to be completed','15. September','Finance','Pending'],
  ['Crockery & Cutlery inventory','Full Stock take of','Only Rampart & Long House','10. July','Purchase','Pending'],
  ['OS&E Inventory','Full Stock take of','Only Rampart & Long House','10. July','Purchase','Pending'],
  ['Linen Inventory','Full Stock take of','Only Rampart & Long House','10. July','Purchase','Pending'],
  ['Broken Items','Remove all broken items and clear out store rooms','Long House has been done, take pictures to keep it that way','10. July','Engineer','Pending'],
  ['Capex Plan','Washing Machines, Ovens, AC’s, Boats, Vehicles, Watersystems, Energy Systems','Rotational 5 Years Capex plannning for all Assets / include Interiors/Machinery etc.','15. September','Engineer','Pending'],
  ['HR Toolkit','Full kit of HR templates for managers on how to deal with: Disciplinary, Staff Performance,','draft has been shared with Steph for review','15. September','HR','In Progress'],
  ['Training Forms','Simple training forms for documentation','has been shared - all Senior team to start recording and shareing with HR immediately','Immediate','HR','Completed'],
  ['Support Team Travels','Travelling document: When are they travelling, Why, Things to be achieved - have they been','Create accountablility document for Senior Teams travel','Immediate','HR','Pending'],
  ['Spare Part list Property','List of Par stock of important items that need to be kept in stock at the Office for potential','e.g. 1 Washing machine, 1 x blender, 1 x Grinder etc.','Immediate','Interior/Engineer','In Progress'],
  ['BOP - Email etiquette','Email etiquette BOP','Draft has been shared with Alvin/Wathsala','10. July','HR','In Progress'],
  ['Recognition Program','Plan for recognition program 2027','MS Creatives to share a basic draft for review, monthly per property, overall for the year (look at criteria)','31. August','MS Creatives','Pending'],
  ['Ice Tea Bar - Long House','Re-style and implement the Ice Tea Bar Concept at Long House','Steph has shared the blends, Sabreena to share style of jars - implementation 24th June','10. July','Interior/MS Creatives','In Progress'],
  ['Key staff identification','Train the Trainer / Hospitality Champion','MS Creatives to share with HR','10. July','MS Creatives','Pending'],
]

const [{ id: orgId }] = await sql`select id from organizations order by created_at asc limit 1`
const [{ id: adminId }] = await sql`select id from profiles where role='admin' and org_id=${orgId} order by created_at asc limit 1`

// upsert teams
const teamId = {}
for (let i = 0; i < TEAMS.length; i++) {
  const [row] = await sql`
    insert into task_teams (org_id, name, sort_order) values (${orgId}, ${TEAMS[i]}, ${i})
    on conflict (org_id, name) do update set sort_order = excluded.sort_order
    returning id, name`
  teamId[row.name] = row.id
}
async function ensureTeam(name) {
  if (teamId[name]) return teamId[name]
  const [row] = await sql`insert into task_teams (org_id, name, sort_order) values (${orgId}, ${name}, 99)
    on conflict (org_id, name) do update set name=excluded.name returning id, name`
  teamId[name] = row.id; return row.id
}

let inserted = 0
for (const [title, detail, updates, deadline, responsible, status] of ROWS) {
  const description = detail + (updates ? `\n\nUpdates: ${updates}` : '')
  const [task] = await sql`
    insert into tasks (org_id, title, description, status, priority, due_date, created_by)
    values (${orgId}, ${title}, ${description}, ${STATUS[status.toLowerCase()] || 'todo'}, 'medium',
            ${parseDeadline(deadline)}, ${adminId})
    returning id`
  for (const tn of splitTeams(responsible)) {
    const tid = await ensureTeam(tn)
    await sql`insert into task_team_links (task_id, team_id) values (${task.id}, ${tid}) on conflict do nothing`
  }
  inserted++
}
console.log(`Seeded ${inserted} tasks; ${Object.keys(teamId).length} teams.`)
await sql.end()
```

- [ ] **Step 2: Commit the script** (do not run yet)

```bash
git add scripts/seed-implementation-tracker.mjs
git commit -m "feat(tasks): implementation-tracker seed script"
```

### Task 3.2: Run the seed + verify

**Files:** none

- [ ] **Step 1: Run** (after M2 is deployed and 0019 applied):

```bash
node scripts/seed-implementation-tracker.mjs
```

Expected: `Seeded 47 tasks; 15 teams.` (47 rows; the PDF's duplicate "Recognition Program" is intentionally seeded once — re-add the second row only if the user wants it.)

- [ ] **Step 2: Verify on the live board** — `/tasks` shows the seeded tasks across To Do / In Progress / Done columns; "Training Forms" is in Done; multi-team rows (e.g. "Styling Guide Service" → Interior + Operations) show two team chips; assignees empty; due dates populated (e.g. 10 Jul 2026), "Kitchen Hygiene & Safety" due 31 Mar 2027, "Training Forms"/"Support Team Travels" have no due date.

- [ ] **Step 3: Update memory** — new Tasks tool + Issues rename shipped; migrations 0018 + 0019 applied; seed run.

---

## Self-review notes (coverage)

- Spec Part 1 (rename) → Tasks 1.1–1.7. Part 2 (new tool: schema/queries/API/pages/components/nav/permissions) → Tasks 2.1–2.12. Part 3 (seed) → Tasks 3.1–3.2. Migrations 0018/0019 → Tasks 1.1 / 2.1.
- Deferred items (Calendar, Gantt, dependency table) intentionally absent.
- Type consistency: `TaskWithRelations`, `TaskFilters`, `STATUSES`/`PRIORITIES`, and the API field names (`assigneeIds`/`teamIds`/`dueDate`/`propertyId`) are used identically across queries, API, and components.
- Known verification caveat: there is no unit-test harness and local build/lint deadlock; each task's "verify" is grep/inspection, and the Coolify build + manual smoke tests (Tasks 1.7, 2.12, 3.2) are the real gates. Watch for ESLint unused-vars on the Linux build.
- Confirm-before-use spots flagged inline: the `profile` active-field name (Task 2.3 Step 4) and the exact org-properties/org-profiles query fn names (Task 2.10 Step 1).
