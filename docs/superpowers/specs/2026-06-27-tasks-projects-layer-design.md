# Projects Layer for Tasks (+ mobile board horizontal scroll)

**Date:** 2026-06-27
**Status:** Approved (design)
**Builds on:** the employee Tasks tool shipped earlier today (`tasks`, `task_teams`, `task_assignees`, `task_team_links`; migrations 0018/0019).

## Summary

Add a **Projects** layer above Tasks: every task belongs to exactly one project, and the Tasks area becomes Projects-first. `/tasks` becomes a **Projects landing**; each project opens its own **Board ⇄ List** (the existing task views, scoped to that project). The 47 imported implementation-tracker tasks are moved under a seeded project **"M&S x TVPL"**.

Also includes one unrelated-but-bundled UX fix: on **mobile, the kanban board scrolls horizontally** through the status columns instead of stacking them vertically.

### Decisions (locked)
- **Project required**: `tasks.projectId` is `NOT NULL` — no orphan/project-less tasks.
- **Collaborative**: any active user creates/edits projects; **delete = creator-or-admin AND only if the project has no tasks** (otherwise `409`).
- **Tasks are movable** between projects (a Project picker in the task dialog).
- **Projects are org-level** (no property tag — "M&S x TVPL" spans properties). Tasks keep their existing optional property tag.
- **Project cards show progress**: done-count / total + a small bar.
- Project FK uses **`ON DELETE RESTRICT`** (DB-level guard mirroring the API 409).

---

## Part 1 — Data model

### New enum
- `project_status`: `active | archived`

### New table `projects`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `orgId` | uuid NOT NULL → organizations.id | |
| `name` | varchar(255) NOT NULL | |
| `description` | text NULL | |
| `color` | varchar(32) NULL | a token/hex for the card accent + chips |
| `status` | `project_status` NOT NULL default `active` | |
| `targetDate` | date NULL | overall project deadline |
| `createdBy` | uuid NULL → profiles.id `ON DELETE SET NULL` | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL default now() | |
| | | UNIQUE `(orgId, name)` |

### Change to `tasks`
- Add `projectId uuid NOT NULL` → `projects.id` `ON DELETE RESTRICT`.

### Drizzle
- `projectStatusEnum`, `projects` table + relations (`project` ↔ `organization`, `creator`, `tasks: many(tasks)`), types `Project`/`NewProject`.
- `tasks` relation gains `project: one(projects, ...)`.

### Migration `drizzle/0020_projects.sql` (additive → backfill → tighten, idempotent)
```sql
CREATE TYPE project_status AS ENUM ('active','archived');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  description text,
  color varchar(32),
  status project_status NOT NULL DEFAULT 'active',
  target_date date,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_org_name_unique UNIQUE (org_id, name)
);
--> statement-breakpoint
-- Seed the M&S x TVPL project for the (single) org
INSERT INTO projects (org_id, name, status, description)
SELECT id, 'M&S x TVPL', 'active', 'Executive implementation tracker — M&S × Taru Villas.'
FROM organizations ORDER BY created_at ASC LIMIT 1
ON CONFLICT (org_id, name) DO NOTHING;
--> statement-breakpoint
-- Add the FK column nullable so existing rows can be backfilled
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE RESTRICT;
--> statement-breakpoint
-- Backfill every existing task to M&S x TVPL
UPDATE tasks SET project_id = (
  SELECT id FROM projects WHERE name = 'M&S x TVPL' ORDER BY created_at ASC LIMIT 1
) WHERE project_id IS NULL;
--> statement-breakpoint
-- Now enforce NOT NULL
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
```
**Apply-before-deploy (coordinated, like 0018/0019):** new code reads `projects` and `tasks.projectId`, and `createTask` requires `projectId`; the `SET NOT NULL` would also break the *old* code's task creation (it doesn't send `project_id`). So 0020 is applied in coordination with the M2-style deploy swap. It is re-runnable (guards: `ON CONFLICT DO NOTHING`, `ADD COLUMN IF NOT EXISTS`, `SET NOT NULL` idempotent).

---

## Part 2 — Queries

### `src/lib/db/queries/projects.ts` (new)
- `ProjectWithCounts` = `Project` + `taskCount: number` + `doneCount: number`.
- `getProjects(orgId, opts?: { includeArchived?: boolean }): Promise<ProjectWithCounts[]>` — left-joins task counts (total + done) grouped per project; archived excluded unless `includeArchived`. Ordered: active first, then `name`.
- `getProjectById(id): Promise<Project | null>`.
- `createProject(data: NewProject): Promise<Project>` (`.returning()`).
- `updateProject(id, data): Promise<Project>` (sets `updatedAt`).
- `deleteProject(id): Promise<{ blocked: boolean; project?: Project }>` — returns `blocked: true` if the project still has tasks (checked via a count) **without** deleting; otherwise deletes and returns the row. (RESTRICT is the DB backstop; this gives a clean 409 message.)

### `src/lib/db/queries/tasks.ts` (modify)
- `TaskFilters` gains `projectId?: string`.
- `getTasks` adds `eq(tasks.projectId, filters.projectId)` when present.
- `NewTask` now requires `projectId` (schema change); `createTask` callers must pass it.
- `TaskWithRelations` optionally surfaces `projectId` (already on the row).

---

## Part 3 — API

### `src/app/api/projects/` (new)
- `GET /api/projects` — list (any active user); `?includeArchived=1` toggles archived. `POST` — create (any active user; `name` required; Zod).
- `GET /api/projects/[id]`, `PATCH /api/projects/[id]` — update (any active user).
- `DELETE /api/projects/[id]` — **creator-or-admin**; if `deleteProject` reports `blocked`, return `409 { error: 'Move or delete this project\'s tasks first' }`.

### `src/app/api/tasks/` (modify)
- `POST /api/tasks`: `projectId` is now **required** in the create schema.
- `GET /api/tasks`: accept `projectId` filter param.
- `PATCH /api/tasks/[id]`: allow `projectId` (move a task between projects).

---

## Part 4 — UI

### `/tasks` → Projects landing (`projects-landing-client.tsx` new)
- Grid of **project cards** (`project-card.tsx`): color accent, name, description (truncated), target date, and a **progress bar** with `doneCount/taskCount` ("12 / 47 done"). Click → `/tasks/[projectId]`.
- A **"New Project"** button → `project-form-dialog.tsx`.
- An **Archived** toggle (nuqs `?archived=1`) to show archived projects.
- Empty state mirrors the existing tasks empty state.
- Renders the `TasksAreaTabs` (now **Projects | Teams**).

### `/tasks/[projectId]` → project board/list (`tasks/[projectId]/page.tsx` new)
- Server component, `requireAuth`, `force-dynamic`. Loads the project (`getProjectById` → `notFound()` if missing), its tasks (`getTasks(orgId, { projectId })`), teams, properties, users.
- Renders the **existing** board/list client (`TasksPageClient`), now fed the project's tasks + a new `projectId` prop (so "New Task" presets the project) + the `projects` list (for the dialog's move-picker). Header shows the project name + **Edit / Delete** (delete via AlertDialog → `DELETE /api/projects/[id]`; 409 surfaces "move or delete its tasks first") + a back link to `/tasks`.

**Refinement to `TasksPageClient` (avoid double tabs):** it currently renders `<TasksAreaTabs>` itself — that rendering **moves up to the landing**. The per-project view instead renders the project header + back link above. `TasksPageClient` gains props `{ projectId: string; project: Project; projects: {id;name}[]; canDeleteProject: boolean }` and drops its internal `<TasksAreaTabs>`. The landing at `/tasks` is the only place the area tabs render.

### Task dialog (`task-form-dialog.tsx` modify)
- Add a **Project** Select (required). On create from within a project, default to that `projectId`; the field stays editable so a task can be **moved** to another project. The dialog receives the `projects` list + an optional `defaultProjectId`.

### Project dialog (`project-form-dialog.tsx` new)
- React Hook Form: `name` (required), `description` (Textarea), `color` (a small swatch picker from a fixed palette), `status` (active/archived Select), `targetDate` (date input). POST `/api/projects` or PATCH `/api/projects/[id]`; toast + `router.refresh()`.

### Navigation
- `TasksAreaTabs`: relabel the first tab **"Projects"** (→ `/tasks`); keep **"Teams"** (→ `/tasks/teams`, admin). The static `/tasks/teams` route takes precedence over `/tasks/[projectId]`, so no collision.
- `header.tsx` `segmentLabels`: keep `tasks: 'Tasks'`; the `[projectId]` UUID segment renders as "Details" (acceptable; the project page header shows the real name).
- Sidebar item stays **"Tasks"** → `/tasks`.

### Mobile board horizontal scroll (`task-board.tsx` modify)
- Change the column wrapper from the stacking grid (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) to: **on mobile, a horizontal-scroll row** of the 4 status columns; **from `sm` up, the existing grid**. Concretely: `flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible`, with each column `w-[78%] shrink-0 sm:w-auto` so a single column dominates the viewport and the user swipes between statuses. Drag-and-drop still works within the scroll container.

---

## Part 5 — Backfill ("M&S x TVPL")

Handled entirely inside migration 0020 (project insert + task backfill + `SET NOT NULL`). No separate script. After 0020, all 47 tasks belong to "M&S x TVPL" and `projectId` is enforced.

---

## Testing & verification
- After 0020: `select count(*) from tasks where project_id is null` → **0**; the "M&S x TVPL" project exists with `taskCount = 47`, `doneCount = 1`.
- `/tasks` shows the M&S x TVPL card with a 1/47 progress bar; clicking it opens the board with all 47 tasks.
- Create a task inside the project → it gets that `projectId`; create a second project → move a task to it via the dialog → it leaves the first board and appears in the second.
- Delete an empty project → succeeds; delete a non-empty project → 409 with the "move or delete its tasks first" toast.
- Mobile: board view scrolls horizontally across To Do / In Progress / Stuck / Done; one column fills most of the width; drag still moves cards.
- Coolify/Linux build is authoritative (local tsc/build/lint deadlock) — watch for unused imports / implicit-any in new files (the area-tab class of bug).

---

## Part 6 — Liquid Glass UI pass (app-wide polish)

A cross-cutting visual refresh giving the app an Apple-style "liquid glass" feel — translucent frosted surfaces with backdrop blur, thin luminous borders, soft layered shadows, and a faint specular sheen. **Applied to elevated/floating surfaces only** (chrome, cards, overlays, accent buttons) — never behind dense body text — so legibility and contrast are preserved. Tasteful and subtle, not a heavy frosted overlay.

### Foundation (`src/app/globals.css` + portal layout)
- Add a **soft app backdrop** in the portal layout (a very subtle light/dark gradient tint behind `SidebarInset`) so glass surfaces have something to refract.
- Add reusable utility classes (CSS, layered on the existing shadcn token system — extend, don't replace):
  - `.glass` — `bg-background/60 dark:bg-background/40`, `backdrop-blur-xl`, `border border-white/25 dark:border-white/10`, soft shadow.
  - `.glass-strong` (more opaque, for dialogs/popovers where text sits) and `.glass-subtle` (lighter, for cards).
  - `.glass-sheen` — a thin top highlight (`::before` linear-gradient) for the specular edge.
- Honor `prefers-reduced-transparency`/low-end fallback: classes degrade to a solid `bg-background` when backdrop-filter is unsupported.

### Surfaces to glassify
- **Sidebar / menu** (desktop `Sidebar` + mobile `Sheet`): frosted translucent panel (`.glass`); nav buttons get a glassy translucent pill on hover/active. (Explicit user ask.)
- **Header** (`header.tsx`): sticky frosted bar (translucent + blur + subtle bottom border).
- **Buttons** (`src/components/ui/button.tsx`): restyle so `default`/`secondary`/`outline`/`ghost` variants pick up subtle translucency + a faint inner top-highlight + smoother hover/active transitions; add a `glass` variant for accent CTAs. Keep `destructive` clearly solid/legible. (Explicit user ask.)
- **Cards** (`src/components/ui/card.tsx`): translucent glass cards (`.glass-subtle`) with thin border — flows to dashboard tiles, project cards, task cards.
- **Overlays** — `dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `select.tsx` content: frosted `.glass-strong` panels with a slightly darkened/blurred backdrop scrim.

### Constraints
- Maintain readable contrast — text-bearing overlays use `.glass-strong` (higher opacity); dense tables/forms keep solid backgrounds.
- Keep blur moderate (`blur-xl` max) and confined to chrome/overlays for performance (avoid blurring large scrolling lists).
- Both **light and dark** themes handled via the existing CSS variables.
- This milestone is **pure styling** (no schema/migration); it ships independently of the Projects parts and should be built/verified first so the new Projects components inherit the glass primitives.

---

## Out of scope (future)
- Per-project Calendar/Gantt (the deferred Tasks phases) — projectId will scope them naturally.
- Project members/permissions beyond collaborative; project-level activity feed; nested sub-projects.
- A full theming/skin system or per-user glass intensity toggle — this pass hard-codes one tasteful liquid-glass look.
