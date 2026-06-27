# Projects Layer + Liquid Glass UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply an app-wide "liquid glass" visual polish (Milestone A), then add a Projects layer above Tasks — every task belongs to a project, `/tasks` becomes a Projects landing, the board moves to `/tasks/[projectId]`, and the 47 imported tasks are backfilled under "M&S x TVPL" (Milestone B). Also: mobile board scrolls horizontally.

**Architecture:** Two milestones on one branch, one coordinated deploy at the end. M-A is pure styling — glass utility classes in `globals.css` + a soft app backdrop, then restyle the shared shadcn primitives (sidebar, header, button, card, dialog/popover/dropdown/select) so the polish propagates everywhere. M-B adds a `projects` table (migration 0020, with in-migration backfill), query/API layers, a Projects landing + per-project board (reusing the existing `TasksPageClient`), a project picker in the task dialog, and a horizontal-scroll board on mobile.

**Tech Stack:** Next.js 16 (App Router, RSC), Drizzle ORM + postgres.js, Supabase Postgres, Tailwind CSS 4 + shadcn/ui (oklch tokens), React Hook Form + Zod v4, nuqs, lucide-react, Sonner, date-fns.

## Global Constraints

- DB client keeps `{ prepare: false }` — never touch `src/lib/db/index.ts`.
- Zod v4: `z.string()` not `.url()`; coerce nullable arrays to `[]` before Drizzle.
- Next.js 16: `await context.params` in dynamic routes; `export const dynamic = 'force-dynamic'` on every data page.
- Auth: pages `requireAuth()`/`requireRole()`; API `getProfile()` (401 if null, 403 if `!profile.isActive`).
- All Drizzle mutations use `.returning()`.
- Migrations are hand-written SQL in `drizzle/NNNN_*.sql` (drizzle-kit history is broken), applied manually by the USER. Subagents WRITE migration files; they never apply them to the DB.
- **No test framework; local `tsc`/`build`/`lint` DEADLOCK.** Verify by grep/inspection. The Coolify (Linux) build is the only real compiler and runs ESLint.
- **Build-breaker guards (learned from a prod build failure this session):** (1) ESLint `no-unused-vars` fails the Linux build — drop unused imports, prefix intentionally-unused params with `_`. (2) **No untyped callback params inside conditional/un-annotated array or object literals** — e.g. `...(cond ? [{ match: (p) => … }] : [])` makes `p` implicitly `any` and fails `noImplicitAny`; annotate the param (`(p: string)`) or type the literal. (3) No `any`. (4) Don't rely on a stored boolean to narrow a nullable (`isEditing ? task.id` fails — use `task ? task.id`).
- Liquid glass is tasteful/subtle: blur ≤ `blur-xl`, confined to chrome/cards/overlays (never behind dense scrolling lists/tables); text-bearing overlays use the more-opaque `.glass-strong`; both light + dark via existing CSS vars; degrade gracefully when `backdrop-filter` is unsupported or `prefers-reduced-transparency`.
- Projects: `tasks.projectId` is `NOT NULL` (FK `ON DELETE RESTRICT`); projects collaborative (delete = creator-or-admin AND empty-only → 409); tasks movable between projects; projects org-level.
- Status colors unchanged: todo=slate, in_progress=amber, stuck=red, done=emerald. Deploy = push to `main`.

---

# MILESTONE A — Liquid Glass UI pass (pure styling, no migration)

### Task A1: Glass utilities + app backdrop

**Files:**
- Modify: `src/app/globals.css` (append at end)
- Modify: `src/app/(portal)/layout.tsx` (soft backdrop behind content)

**Interfaces:**
- Produces CSS classes `.glass`, `.glass-strong`, `.glass-subtle`, `.glass-sheen` for later tasks.

- [ ] **Step 1: Append the glass utilities to `globals.css`** (after the existing theme blocks):

```css
/* ---- Liquid glass utilities ---- */
@layer components {
  .glass {
    background-color: color-mix(in oklch, var(--card) 62%, transparent);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid color-mix(in oklch, var(--foreground) 8%, transparent);
    box-shadow: 0 8px 32px -8px color-mix(in oklch, var(--foreground) 18%, transparent);
  }
  .glass-strong {
    background-color: color-mix(in oklch, var(--popover) 82%, transparent);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid color-mix(in oklch, var(--foreground) 10%, transparent);
  }
  .glass-subtle {
    background-color: color-mix(in oklch, var(--card) 72%, transparent);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid color-mix(in oklch, var(--foreground) 7%, transparent);
  }
  .glass-sheen { position: relative; isolation: isolate; }
  .glass-sheen::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
    background: linear-gradient(to bottom, color-mix(in oklch, white 28%, transparent), transparent 45%);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .glass, .glass-strong, .glass-subtle { background-color: var(--card); }
  }
  @media (prefers-reduced-transparency: reduce) {
    .glass, .glass-strong, .glass-subtle {
      background-color: var(--card);
      -webkit-backdrop-filter: none; backdrop-filter: none;
    }
  }
}
```

- [ ] **Step 2: Add the soft app backdrop** in `src/app/(portal)/layout.tsx`. The current `<main className="flex-1 p-6">` becomes a layered surface with a faint radial tint so glass surfaces have something to refract:

```tsx
<main className="relative flex-1 p-4 sm:p-6">
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_120%_at_50%_-10%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_55%)]"
  />
  {children}
</main>
```

(Keep everything else in the layout unchanged. Note `p-6`→`p-4 sm:p-6` for tighter mobile padding.)

- [ ] **Step 3: Verify** — `grep -n "\.glass" src/app/globals.css` shows the four classes; the layout still wraps `{children}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css "src/app/(portal)/layout.tsx"
git commit -m "feat(ui): liquid-glass utilities + soft app backdrop"
```

### Task A2: Glassify the sidebar + mobile menu + nav buttons

**Files:**
- Modify: `src/components/ui/sidebar.tsx` (mobile `Sheet` panel ~line 190; desktop sidebar container)
- Modify: `src/components/layout/app-sidebar.tsx` (nav `SidebarMenuButton` hover/active)

- [ ] **Step 1: Mobile sheet** — the mobile sidebar `SheetContent` className currently is `bg-sidebar text-sidebar-foreground w-(--sidebar-width) gap-0 rounded-r-2xl border-r-0 p-0 shadow-2xl [&>button]:hidden`. Change `bg-sidebar` → `glass glass-sheen text-sidebar-foreground` (keep the rest): the drawer becomes frosted glass.

- [ ] **Step 2: Desktop sidebar** — in the non-mobile branch, the inner sidebar container `<div data-sidebar="sidebar" ... className="bg-sidebar ...">` (the gap/`group-data-[variant=floating]` panel): add `glass` to that inner panel's className alongside the existing classes, and remove a hard `bg-sidebar` if it would fight the glass (replace `bg-sidebar` with `glass`). Read the file's desktop branch and apply to the element that paints the sidebar surface.

- [ ] **Step 3: Nav buttons** — in `app-sidebar.tsx`, the three `SidebarMenuButton` instances already have `className="h-9 rounded-lg transition-colors data-[active=true]:font-medium"`. Append a glassy hover/active: `hover:bg-white/40 dark:hover:bg-white/5 data-[active=true]:bg-white/55 dark:data-[active=true]:bg-white/10 data-[active=true]:shadow-sm` (replace_all on that exact className string).

- [ ] **Step 4: Verify** — `grep -rn "glass" src/components/ui/sidebar.tsx src/components/layout/app-sidebar.tsx`; confirm the mobile sheet and desktop panel both carry `glass`, and nav buttons carry the translucent hover/active.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/sidebar.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(ui): frosted-glass sidebar + nav buttons"
```

### Task A3: Glassify the header

**Files:**
- Modify: `src/components/layout/header.tsx` (the `<header>` element ~line 94)

- [ ] **Step 1:** Change the header className from `flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4` to `glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4` (drop the plain `border-b` — `.glass` supplies a border; add sticky+blur so content scrolls under the frosted bar). Keep everything inside unchanged.

- [ ] **Step 2: Verify** — `grep -n "glass sticky" src/components/layout/header.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/header.tsx
git commit -m "feat(ui): frosted sticky header"
```

### Task A4: Glassify buttons

**Files:**
- Modify: `src/components/ui/button.tsx` (the `buttonVariants` cva)

- [ ] **Step 1:** Update the `variant` map to add subtle translucency + a faint top highlight on the elevated variants, and add a `glass` variant. Replace the `variant` object with:

```ts
variant: {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]",
  destructive:
    "bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 active:scale-[0.98]",
  outline:
    "border border-white/30 bg-card/60 backdrop-blur-md shadow-xs hover:bg-accent/70 hover:text-accent-foreground dark:border-white/10 dark:bg-input/30 dark:hover:bg-input/50 active:scale-[0.98]",
  secondary:
    "bg-secondary/70 text-secondary-foreground backdrop-blur-md shadow-xs hover:bg-secondary/90 active:scale-[0.98]",
  ghost:
    "hover:bg-accent/60 hover:text-accent-foreground dark:hover:bg-accent/40",
  link: "text-primary underline-offset-4 hover:underline",
  glass:
    "glass glass-sheen text-foreground hover:bg-card/80 active:scale-[0.98]",
},
```

(Leave the base string, `size`, `defaultVariants`, and the `Button` component unchanged. `transition-all` is already in the base, so `active:scale` animates.)

- [ ] **Step 2: Verify** — `grep -n "glass glass-sheen\|active:scale" src/components/ui/button.tsx`. Confirm `destructive` stays solid (legibility).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): translucent button variants + glass variant"
```

### Task A5: Glassify cards

**Files:**
- Modify: `src/components/ui/card.tsx` (the `Card` root ~line 10)

- [ ] **Step 1:** Change the `Card` root className from `bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm` to `glass-subtle glass-sheen text-card-foreground flex flex-col gap-6 rounded-xl py-6` (drop the plain `bg-card`/`border`/`shadow-sm` — `.glass-subtle` supplies translucent bg + border; `.glass-sheen` adds the highlight). Leave `CardHeader`/`CardContent`/etc. unchanged.

- [ ] **Step 2: Verify** — `grep -n "glass-subtle glass-sheen" src/components/ui/card.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(ui): frosted-glass cards"
```

### Task A6: Glassify overlays (dialog, popover, dropdown, select)

**Files:**
- Modify: `src/components/ui/dialog.tsx` (DialogContent surface)
- Modify: `src/components/ui/popover.tsx` (PopoverContent)
- Modify: `src/components/ui/dropdown-menu.tsx` (DropdownMenuContent)
- Modify: `src/components/ui/select.tsx` (SelectContent)

- [ ] **Step 1:** In each file, find the content element's className and replace its opaque surface class (`bg-popover` or `bg-background`) with `glass-strong` (keep all layout/animation/border-radius classes; `.glass-strong` is opaque enough for text). For `dialog.tsx` also bump the overlay scrim if present (`bg-black/50` → `bg-black/40 backdrop-blur-sm`). Apply the same `bg-popover → glass-strong` swap in popover/dropdown/select content. Do NOT change positioning/animation classes.

- [ ] **Step 2: Verify** — `grep -rn "glass-strong" src/components/ui/dialog.tsx src/components/ui/popover.tsx src/components/ui/dropdown-menu.tsx src/components/ui/select.tsx` shows one hit each; `grep -rn "bg-popover" ` on those four shows none left on the content surfaces.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/popover.tsx src/components/ui/dropdown-menu.tsx src/components/ui/select.tsx
git commit -m "feat(ui): frosted-glass overlays (dialog/popover/dropdown/select)"
```

---

# MILESTONE B — Projects layer

### Task B1: Migration 0020 + schema

**Files:**
- Create: `drizzle/0020_projects.sql`
- Modify: `src/lib/db/schema.ts`

**Interfaces:**
- Produces: `projectStatusEnum` (`'active'|'archived'`), `projects` table, relations, types `Project`/`NewProject`; `tasks.projectId` column; `tasks` relation `project`.

- [ ] **Step 1: Write `drizzle/0020_projects.sql`** exactly as in the spec (Part 1 migration block): create `project_status` enum, `projects` table (with `projects_org_name_unique`), seed the "M&S x TVPL" project via `INSERT … SELECT … FROM organizations … ON CONFLICT DO NOTHING`, `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE RESTRICT`, backfill `UPDATE tasks SET project_id = (SELECT id FROM projects WHERE name='M&S x TVPL' …) WHERE project_id IS NULL`, then `ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL`. Use `--> statement-breakpoint` between statements. **Do NOT apply it** (user-gated).

- [ ] **Step 2: Append to `schema.ts`** — enum + table + relations + types:

```ts
export const projectStatusEnum = pgEnum('project_status', ['active', 'archived'])

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 32 }),
  status: projectStatusEnum('status').default('active').notNull(),
  targetDate: date('target_date'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique('projects_org_name_unique').on(t.orgId, t.name)])

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  creator: one(profiles, { fields: [projects.createdBy], references: [profiles.id] }),
  tasks: many(tasks),
}))

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
```

- [ ] **Step 3: Add `projectId` to the `tasks` table** definition (the table added in migration 0019). Insert after `orgId`:

```ts
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
```

Because `tasks` is defined ABOVE `projects` in the file, the `() => projects.id` thunk is fine (lazy). Then in `tasksRelations`, add: `project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),`.

- [ ] **Step 4: Verify** — `grep -nE "pgEnum\('project_status'|pgTable\('projects'|projectId: uuid" src/lib/db/schema.ts` shows all three; `date`/`varchar`/`unique` already imported (confirm).

- [ ] **Step 5: Commit**

```bash
git add drizzle/0020_projects.sql src/lib/db/schema.ts
git commit -m "feat(projects): migration 0020 + schema (projects + tasks.projectId)"
```

### Task B2: Project queries + task-query changes

**Files:**
- Create: `src/lib/db/queries/projects.ts`
- Modify: `src/lib/db/queries/tasks.ts`

**Interfaces:**
- Produces: `ProjectWithCounts = Project & { taskCount: number; doneCount: number }`; `getProjects(orgId, opts?: { includeArchived?: boolean }): Promise<ProjectWithCounts[]>`; `getProjectById(id): Promise<Project | null>`; `createProject(data: NewProject): Promise<Project>`; `updateProject(id, data: Partial<NewProject>): Promise<Project>`; `deleteProject(id): Promise<{ blocked: boolean; project?: Project }>`.
- Modifies: `TaskFilters` (+`projectId?`), `getTasks` (filters by it), `NewTask` now carries `projectId` (from schema), `createTask` callers must pass it.

- [ ] **Step 1: Write `projects.ts`**

```ts
import { eq, and, asc, sql } from 'drizzle-orm'
import { db } from '..'
import { projects, tasks, type Project, type NewProject } from '../schema'

export interface ProjectWithCounts extends Project {
  taskCount: number
  doneCount: number
}

export async function getProjects(
  orgId: string, opts: { includeArchived?: boolean } = {},
): Promise<ProjectWithCounts[]> {
  const conditions = [eq(projects.orgId, orgId)]
  if (!opts.includeArchived) conditions.push(eq(projects.status, 'active'))
  const rows = await db
    .select({
      project: projects,
      taskCount: sql<number>`count(${tasks.id})`.as('task_count'),
      doneCount: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.as('done_count'),
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .groupBy(projects.id)
    .orderBy(asc(projects.status), asc(projects.name))
  return rows.map((r) => ({ ...r.project, taskCount: Number(r.taskCount), doneCount: Number(r.doneCount) }))
}

export async function getProjectById(id: string): Promise<Project | null> {
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  return p ?? null
}

export async function createProject(data: NewProject): Promise<Project> {
  const [p] = await db.insert(projects).values(data).returning()
  return p
}

export async function updateProject(id: string, data: Partial<NewProject>): Promise<Project> {
  const [p] = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning()
  return p
}

export async function deleteProject(id: string): Promise<{ blocked: boolean; project?: Project }> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.projectId, id))
  if (Number(count) > 0) return { blocked: true }
  const [project] = await db.delete(projects).where(eq(projects.id, id)).returning()
  return { blocked: false, project }
}
```

- [ ] **Step 2: Modify `tasks.ts`** — add `projectId?: string` to `TaskFilters`; in `getTasks`, after the other eq filters add `if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId))`. `createTask`'s `data: NewTask` now includes the required `projectId` (no code change needed in the fn — callers pass it). No other change.

- [ ] **Step 3: Verify** — `grep -n "projectId" src/lib/db/queries/tasks.ts` shows the filter; `projects.ts` imports resolve.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/projects.ts src/lib/db/queries/tasks.ts
git commit -m "feat(projects): project queries + task projectId filter"
```

### Task B3: API — projects CRUD + task projectId wiring

**Files:**
- Create: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`
- Modify: `src/app/api/tasks/route.ts` (POST create schema), `src/app/api/tasks/[id]/route.ts` (PATCH allow projectId)

- [ ] **Step 1: `projects/route.ts`** — `GET` (any active user; `?includeArchived=1` → `getProjects(orgId, { includeArchived: true })`); `POST` (any active user) validates `{ name: z.string().min(1), description: z.string().nullable().optional(), color: z.string().nullable().optional(), status: z.enum(['active','archived']).optional(), targetDate: z.string().nullable().optional() }`, calls `createProject({ ...data, orgId: profile.orgId, createdBy: profile.id, description: data.description ?? null, color: data.color ?? null, targetDate: data.targetDate ?? null })`, 201. On unique-violation (`23505`) return 409 `{ error: 'A project with that name already exists' }` (narrow `unknown` with `'code' in error`). Mirror `src/app/api/tasks/teams/route.ts` structure.

- [ ] **Step 2: `projects/[id]/route.ts`** — `GET` (active user) `getProjectById` → 404 if null. `PATCH` (active user) same field schema (all optional) → `updateProject`. `DELETE` — load project (404 if missing); gate **creator-or-admin** (`profile.role !== 'admin' && project.createdBy !== profile.id` → 403); call `deleteProject(id)`; if `blocked` return `409 { error: 'Move or delete this project\'s tasks first' }`; else return the deleted project. `await context.params` in all.

- [ ] **Step 3: Modify `tasks/route.ts`** — in the POST `createSchema`, add `projectId: z.string().uuid()` (required). Pass `projectId: parsed.data.projectId` into `createTask`'s data. Also accept `projectId` as a GET filter param: add `projectId: sp.get('projectId') || undefined` to the `filters` object.

- [ ] **Step 4: Modify `tasks/[id]/route.ts`** — in the PATCH `patchSchema`, add `projectId: z.string().uuid().optional()`. Thread it into the `data` passed to `updateTask` (it's already spread via `...rest` if you add it to the destructure-safe set — ensure `projectId` flows into the update object).

- [ ] **Step 5: Verify** — `grep -rn "projectId" src/app/api/tasks/route.ts src/app/api/tasks/[id]/route.ts` shows create-required + filter + patch; projects routes exist with the admin/creator gates.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects "src/app/api/tasks"
git commit -m "feat(projects): projects CRUD API + task projectId wiring"
```

### Task B4: Project card + project dialog

**Files:**
- Create: `src/components/tasks/project-card.tsx`, `src/components/tasks/project-form-dialog.tsx`

**Interfaces:**
- Produces: `ProjectCard` (props `{ project: ProjectWithCounts; onClick: () => void }`); `ProjectFormDialog` (props `{ open: boolean; onOpenChange: (o: boolean) => void; project?: Project | null; onSaved: () => void }`).
- Consumes: `ProjectWithCounts` from `@/lib/db/queries/projects`, `Project` from `@/lib/db/schema`.

- [ ] **Step 1: `project-card.tsx`** — a `Card` (glass via the primitive) with: a color accent strip/dot using `project.color` (fallback to a neutral), the name, truncated description, target date (`date-fns format` guarded for null), a status badge if archived, and a **progress bar**: `doneCount/taskCount` with a filled bar (`width: ${taskCount ? (doneCount/taskCount)*100 : 0}%`) and a `"{doneCount} / {taskCount} done"` label. Whole card `onClick`. Use a fixed COLOR palette constant (see Step 3).

- [ ] **Step 2: `project-form-dialog.tsx`** — RHF dialog, create/edit. Fields: `name` (Input, required), `description` (Textarea), `color` (a row of swatch buttons from the palette; selected stored in state), `status` (Select active/archived), `targetDate` (Input type=date). Submit → POST `/api/projects` or PATCH `/api/projects/${project.id}`; body `{ name, description, color, status, targetDate: targetDate || null }`; toast + `onSaved()` + `router.refresh()` + close. Mirror `src/components/tasks/task-form-dialog.tsx` for structure/conventions.

- [ ] **Step 3: Shared palette** — define inline in `project-card.tsx` and import into the dialog (or duplicate the small const): `export const PROJECT_COLORS = ['#64748b','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'] as const` (slate/sky/emerald/amber/red/violet/pink/teal). A null/unset color renders as the first (slate).

- [ ] **Step 4: Verify** — both files `'use client'`, imports resolve, no `any`, no unused imports.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/project-card.tsx src/components/tasks/project-form-dialog.tsx
git commit -m "feat(projects): project card + create/edit dialog"
```

### Task B5: Projects landing + tasks/page.tsx + area-tab relabel

**Files:**
- Create: `src/components/tasks/projects-landing-client.tsx`
- Modify: `src/app/(portal)/tasks/page.tsx` (now renders the landing)
- Modify: `src/components/tasks/tasks-area-tabs.tsx` (label "Projects")

**Interfaces:**
- Produces: `ProjectsLandingClient` (props `{ projects: ProjectWithCounts[]; isAdmin: boolean }`).

- [ ] **Step 1: `projects-landing-client.tsx`** — `'use client'`. Renders `<TasksAreaTabs isAdmin={isAdmin} />`, an `<h1>Tasks</h1>` + subtitle, a "New Project" button (opens `ProjectFormDialog` with `project={null}`), an **Archived** toggle via nuqs `useQueryState('archived')` (when toggled, the page must re-fetch with archived — since the server reads the param, use `?archived=1`; set `shallow: false` so the RSC re-runs). A responsive grid of `<ProjectCard>` (`onClick={() => router.push('/tasks/' + project.id)}`). Empty state ("No projects yet — create one"). Mirror `tasks-page-client.tsx` conventions.

- [ ] **Step 2: `tasks/page.tsx`** — replace its body: `requireAuth()`, `export const dynamic = 'force-dynamic'`, read `searchParams` for `archived`, load `getProjects(profile.orgId, { includeArchived: archived === '1' })`, render `<ProjectsLandingClient projects={projects} isAdmin={profile.role === 'admin'} />`. (Remove the old `getTasks`/`getTaskTeams`/board wiring — that moves to the `[projectId]` page in B6.) Next.js 16: `searchParams` is a Promise — `const sp = await searchParams`.

```tsx
import { requireAuth } from '@/lib/auth/guards'
import { getProjects } from '@/lib/db/queries/projects'
import { ProjectsLandingClient } from '@/components/tasks/projects-landing-client'

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  searchParams,
}: { searchParams: Promise<{ archived?: string }> }) {
  const profile = await requireAuth()
  if (!profile) return null
  const sp = await searchParams
  const projects = await getProjects(profile.orgId, { includeArchived: sp.archived === '1' })
  return <ProjectsLandingClient projects={projects} isAdmin={profile.role === 'admin'} />
}
```

- [ ] **Step 3: Relabel the area tab** — in `tasks-area-tabs.tsx`, change the first tab `label: 'Tasks'` → `label: 'Projects'` (keep `href: '/tasks'`, `match: (p: string) => p === '/tasks'`). Leave the Teams tab.

- [ ] **Step 4: Verify** — `grep -n "ProjectsLandingClient\|getProjects" "src/app/(portal)/tasks/page.tsx"`; `grep -n "Projects" src/components/tasks/tasks-area-tabs.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/projects-landing-client.tsx "src/app/(portal)/tasks/page.tsx" src/components/tasks/tasks-area-tabs.tsx
git commit -m "feat(projects): projects landing replaces tasks board page"
```

### Task B6: Per-project board page + TasksPageClient refactor + task-dialog project picker

**Files:**
- Create: `src/app/(portal)/tasks/[projectId]/page.tsx`
- Modify: `src/components/tasks/tasks-page-client.tsx` (project-scoped: drop area tabs, add project header/back/delete, projectId+projects props)
- Modify: `src/components/tasks/task-form-dialog.tsx` (add Project picker)

**Interfaces:**
- `TasksPageClient` new props: `{ tasks; teams; properties; users; currentUserId; isAdmin; project: Project; projects: { id: string; name: string }[]; canDeleteProject: boolean }` (drops nothing else; ADDS `project`, `projects`, `canDeleteProject`).
- `TaskFormDialog` new props: `projects: { id: string; name: string }[]`, `defaultProjectId?: string`.

- [ ] **Step 1: `tasks/[projectId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getProjectById, getProjects } from '@/lib/db/queries/projects'
import { getTasks, getTaskTeams } from '@/lib/db/queries/tasks'
import { getAllProperties } from '@/lib/db/queries/properties'
import { getProfiles } from '@/lib/db/queries/profiles'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const dynamic = 'force-dynamic'

export default async function ProjectBoardPage({
  params,
}: { params: Promise<{ projectId: string }> }) {
  const profile = await requireAuth()
  if (!profile) return null
  const { projectId } = await params
  const project = await getProjectById(projectId)
  if (!project || project.orgId !== profile.orgId) notFound()
  const [tasks, teams, properties, users, allProjects] = await Promise.all([
    getTasks(profile.orgId, { projectId }),
    getTaskTeams(profile.orgId),
    getAllProperties(profile.orgId),
    getProfiles(profile.orgId),
    getProjects(profile.orgId, { includeArchived: true }),
  ])
  return (
    <TasksPageClient
      tasks={tasks}
      teams={teams}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
      currentUserId={profile.id}
      isAdmin={profile.role === 'admin'}
      project={project}
      projects={allProjects.map((p) => ({ id: p.id, name: p.name }))}
      canDeleteProject={profile.role === 'admin' || project.createdBy === profile.id}
    />
  )
}
```

- [ ] **Step 2: Refactor `tasks-page-client.tsx`** — (a) add the new props (`project`, `projects`, `canDeleteProject`); (b) **remove** the `<TasksAreaTabs … />` render (it now lives only on the landing) and its import; (c) replace the page `<h1>Tasks</h1>` header block with a project header: a back link `‹ Projects` (`<Link href="/tasks">`), the `project.name` as `<h1>`, an **Edit** button (opens `ProjectFormDialog` with `project={project}`) and a **Delete** button shown when `canDeleteProject` (AlertDialog → `DELETE /api/projects/${project.id}`; on 409 `toast.error(body.error)`; on success `router.push('/tasks')`); (d) when opening the New-Task dialog, pass `projects={projects}` and `defaultProjectId={project.id}` to `<TaskFormDialog>`. Keep the Board/List toggle + filters + task dialog logic. Import `ProjectFormDialog` from `./project-form-dialog`, `Project` from `@/lib/db/schema`.

- [ ] **Step 3: `task-form-dialog.tsx` project picker** — add props `projects: { id: string; name: string }[]` and `defaultProjectId?: string`. Add a **Project** `Select` (required) to the form, value held in RHF (or state) like the property field; default to `task?.projectId ?? defaultProjectId ?? ''`. Include `projectId` in the submit body. On create, `projectId` must be set (it will be, via `defaultProjectId`); guard the submit so it isn't empty.

- [ ] **Step 4: Verify** — `grep -n "TasksAreaTabs" src/components/tasks/tasks-page-client.tsx` returns nothing (removed); `grep -n "defaultProjectId\|projectId" src/components/tasks/task-form-dialog.tsx` shows the picker; the `[projectId]` page passes all props.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/tasks/[projectId]" src/components/tasks/tasks-page-client.tsx src/components/tasks/task-form-dialog.tsx
git commit -m "feat(projects): per-project board + task project picker"
```

### Task B7: Mobile horizontal-scroll board

**Files:**
- Modify: `src/components/tasks/task-board.tsx` (column wrapper)

- [ ] **Step 1:** Change the columns wrapper from the stacking grid `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` to a horizontal-scroll flex on mobile that becomes the grid from `sm`:

```tsx
<div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
```

and add to each status column's className `w-[80%] shrink-0 snap-start sm:w-auto` so on mobile one column fills ~80% of the viewport and the user swipes between statuses (drag-drop still works inside the scroll container).

- [ ] **Step 2: Verify** — `grep -n "overflow-x-auto\|snap-x" src/components/tasks/task-board.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/task-board.tsx
git commit -m "feat(tasks): horizontal-scroll board columns on mobile"
```

---

# DEPLOY (user-gated, after all tasks reviewed)

- [ ] **Apply migration 0020** in coordination with the deploy (like 0018/0019): it adds `tasks.project_id`, backfills all tasks to "M&S x TVPL", then `SET NOT NULL` (which also stops the old code from inserting project-less tasks). Apply right around the build swap. Command pattern (user runs from dev box):

```bash
node -e "import('postgres').then(async ({default:postgres})=>{const fs=require('fs');const e=fs.readFileSync('.env.local','utf8');const g=k=>(e.match(new RegExp('^'+k+'=(.*)$','m'))?.[1]||'').replace(/^[\"']|[\"']$/g,'');const sql=postgres(g('POSTGRES_URL')||g('DATABASE_URL'),{prepare:false});await sql.unsafe(fs.readFileSync('drizzle/0020_projects.sql','utf8'));console.log('0020 applied');await sql.end();})"
```

- [ ] **Merge + push** (Milestone A is pure styling and safe; Milestone B needs 0020 applied around it).
- [ ] **Smoke test:** glass look on sidebar/header/buttons/cards/dialogs (light + dark); `/tasks` shows the M&S x TVPL card (1/47 progress); open it → 47 tasks; create a 2nd project, move a task into it; delete an empty project (ok) vs non-empty (409); mobile board scrolls horizontally; staff can reach `/tasks`, `/tasks/teams` admin-only.

---

## Self-review notes (coverage)

- Spec Part 1 (data model) → B1. Part 2 (queries) → B2. Part 3 (API) → B3. Part 4 (UI: landing→B5, project board+dialog picker→B6, project dialog/card→B4, mobile scroll→B7, nav relabel→B5). Part 5 (backfill) → inside 0020 (B1). Part 6 (liquid glass) → A1–A6.
- Type consistency: `ProjectWithCounts`, `Project`/`NewProject`, `TaskFilters.projectId`, `TasksPageClient`'s added props, `TaskFormDialog`'s `projects`/`defaultProjectId`, and `PROJECT_COLORS` are used identically across tasks.
- Build-breaker guards called out in Global Constraints (the implicit-any-in-spread lesson); `tasks-area-tabs.tsx` already annotates `match: (p: string)`.
- Verification is grep/inspection + the user-gated migration + Coolify build (no test suite; local build deadlocks). Migration 0020 is re-runnable (guards), applied around the deploy.
- Known seam: `searchParams`/`params` are Promises in Next 16 (awaited in B5/B6).
