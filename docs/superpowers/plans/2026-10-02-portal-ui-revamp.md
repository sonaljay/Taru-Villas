# Portal UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the entire Taru Villas portal welcoming and easy to operate for administrators, property managers, and staff, with clearly defined inputs and dependable feedback.

**Architecture:** Apply a scoped hospitality theme to the authenticated and auth layouts, propagate it to Radix overlays with a small React context, and refine existing components using their current data contracts. Shared navigation and form safeguards support module-specific layout changes. Sequence the shell and three representative flows first, then complete every module in the approved coverage table.

**Tech Stack:** Next.js 16.1.6, React 19, TypeScript, Tailwind CSS 4, shadcn/Radix, Lucide, React Hook Form, nuqs, Recharts, Sonner, Vitest; existing Supabase/Drizzle backend.

**Spec:** `docs/superpowers/specs/2026-10-02-portal-ui-revamp-design.md` — approved on 2 October 2026. Read the spec and this plan before execution.

## Global Constraints

- Administrators, property managers, and staff receive equal design attention.
- Keep Next.js, shadcn/Radix, Tailwind, Lucide, React Hook Form, nuqs, Recharts, Sonner, and the existing fetching/mutation contracts.
- No dependency additions or database migrations are required for this design.
- Body and editable text are 16px; desktop secondary metadata is 14px.
- Controls are 44–48px high in ordinary forms.
- Preserve route names and deep links; rename only visible group headings.
- Filter every destination using the existing role, fleet capability, assignment, and enabled-module rules.
- No automatic saving, draft persistence, or offline queue is added by this work.
- Existing primary actions remain visible. Status terms match the business state.
- Public guest surveys, menus, excursions, utility links, driver manifests, and other external pages retain their intentional designs.
- Develop on the current `main` checkout. Do not promote to `taru-release` or deploy to production before review of the finished implementation.
- Preserve every data page's `force-dynamic`, server guards, schemas, query/mutation semantics, organization boundaries, confidential fields, and existing score thresholds.
- Add behavioural tests for changed interactions; do not add assertions that repeat CSS classes or tests for purely visual edits.
- Existing survey draft/automatic-save behaviour is preserved; the prohibition above prevents adding new saving features elsewhere.

## Review Focus

1. Body-portalled menus opened inside a form: theme, focus, readability, and selection must work while public-page overlays retain their defaults. Browser checks belong to Tasks 1 and 12.
2. Dirty nested forms, cancelled dismissal, and failed saves: values must remain; route/property/tab changes must not silently discard edits. Behavioural checks belong to Tasks 3, 6–10, and 12.
3. A user with restricted modules, fleet capabilities, or property assignments: navigation must never imply permissions that the server does not grant. Unit checks belong to Task 2; authenticated browser checks belong to Task 12.
4. A 320px phone or 200% zoom with a long task/property name: essential fields/actions must remain reachable and tables must not expand the whole page. Browser checks belong to Tasks 5, 8–10, and 12.
5. Switching property visit/other trip, existing/new task, or inactive record during editing: preserve valid saved choices, expose active validation, and do not block on hidden fields. Browser checks belong to Task 6; existing constraint tests remain applicable.

## Execution and review boundaries

Recommend **Native execution in this chat** because most work depends on the same theme and form primitives. The alternative is sequential subagent implementation and review per task. Do not spawn agents until Sonal chooses an execution method; do not create separate sidebar chats for implementation subtasks.

This is one revamp with ordered checkpoints, not independent new business subsystems. Finish all twelve tasks before describing it as a full UI revamp. Commit coherent checkpoints after verification, staging only files owned by the checkpoint. Do not revert unrelated edits. A worktree is unnecessary because the approved spec explicitly selects the existing main checkout; recheck status before execution.

## File and responsibility map

| Responsibility | Files |
| --- | --- |
| Theme boundary | New `src/components/providers/portal-theme-provider.tsx`; `src/app/globals.css`; authenticated/auth layouts; UI overlay primitives |
| Navigation presentation | New `src/lib/portal/navigation.ts` and its test; existing sidebar, header, property switcher, notification inbox |
| Form safety | New `src/components/providers/unsaved-changes-provider.tsx`, `src/hooks/use-unsaved-changes.ts`, `src/components/ui/form-error-summary.tsx`; existing form owners retain validation and save requests |
| Representative flows | Existing dashboard components; Task Manager workspace/details/forms; Fleet request form and its dialog owners |
| Module coverage | Existing survey, SOP, daily-record, utility, waste, roster, asset, property-content, administration, and auth components; page wrappers remain server components |
| Verification | New `scripts/check-portal-ui.cjs`; `docs/runbooks/portal-ui-acceptance.md`; existing Vitest suites |

## Task 1: Scoped theme, shared controls, and overlays

**Files:** Create `src/components/providers/portal-theme-provider.tsx`. Modify `src/app/globals.css`, `src/app/(portal)/layout.tsx`, `src/app/(auth)/layout.tsx`, `src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `select.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, and `sidebar.tsx` within `src/components/ui/`.

**Interfaces:** Export `PortalThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement` and `usePortalThemeClassName(): 'portal-theme' | undefined`. Only overlay components call the hook. Theme context defaults to false; shared input/card/button signatures remain unchanged.

- [ ] Capture baseline desktop/phone screenshots of dashboard, tasks, ride request, login, and an accessible public page before editing. Record routes and viewport sizes in the acceptance runbook introduced in Task 12.
- [ ] Add the theme context and apply it around existing auth/portal content:

```tsx
'use client'
import { createContext, useContext, type ReactNode } from 'react'
const PortalThemeContext = createContext(false)
export function PortalThemeProvider({ children }: { children: ReactNode }) {
  return <PortalThemeContext.Provider value={true}>{children}</PortalThemeContext.Provider>
}
export function usePortalThemeClassName(): 'portal-theme' | undefined {
  return useContext(PortalThemeContext) ? 'portal-theme' : undefined
}
```

Apply `portal-theme` directly to `SidebarProvider` and the auth layout's existing wrapper. Put Toaster inside the provider and give its root the same theme class. Do not insert a new layout wrapper that breaks the sidebar's flex sizing.

- [ ] In each body-portalled Content/Overlay/SubContent component, call the hook at the component top level and append its returned class with `cn`. Example for DialogContent:

```tsx
const portalThemeClassName = usePortalThemeClassName()
// Retain existing Radix props, slots, children, focus, close, and animation logic.
className={cn(existingContentClasses, portalThemeClassName, className)}
```

Use the component's existing literal class string in place of the explanatory identifier above. Theme the actual content root, not Radix Portal itself. Dropdown submenus and tooltip content also need the scope. Mobile sidebar SheetContent uses explicit forest sidebar tokens.

- [ ] Add `.portal-theme` light token definitions using all eleven colours in the spec. Define existing semantic variables (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--input`, `--ring`, `--sidebar-*`) and new `--portal-field-background`. Preserve global root/public tokens. Add companion `.dark .portal-theme, .portal-theme.dark` tokens with dark-green surfaces, pale text, lighter field boundaries, and a visible focus ring; calculate their contrast before selecting final values.
- [ ] Add scoped control styling that also handles explicit native-control classes:

```css
.portal-theme :is([data-slot="input"], [data-slot="select-trigger"], .portal-field) {
  min-height: 46px;
  background: var(--portal-field-background);
  border-color: var(--input);
  border-radius: 12px;
  font-size: 16px;
}
.portal-theme :is([data-slot="textarea"], textarea.portal-field) {
  min-height: 104px;
  background: var(--portal-field-background);
  border-color: var(--input);
  border-radius: 12px;
  font-size: 16px;
}
.portal-theme :is(.glass, .glass-strong, .glass-subtle),
.portal-theme:is([data-slot="dialog-content"], [data-slot="select-content"],
  [data-slot="popover-content"], [data-slot="dropdown-menu-content"],
  [data-slot="dropdown-menu-sub-content"], [data-slot="sheet-content"]) {
  background: var(--card);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
```

Add 16px/14px body/supporting copy conventions, system-serif page titles, readable table headings, 44px ordinary action targets, defined invalid/disabled/read-only treatments, and a visible scoped focus outline. Exclude file/radio/checkbox/range controls from text-field height rules. Do not override Radix positioning, pointer events, or focus trapping. Retain intentional dense-grid sizes and give them explicit classes.
- [ ] Add print overrides to remove portal chrome and backgrounds; honour reduced motion. Use no animation on initial page appearance.
- [ ] Browser-check a dropdown inside a dialog, dropdown submenus, select keyboard interaction, mobile sidebar, and Toaster. Compare public-page screenshots. Run `npx tsc --noEmit` and focused lint for edited files. Commit `feat: introduce scoped hospitality theme`.

## Task 2: Navigation hierarchy and property context

**Files:** Create `src/lib/portal/navigation.ts`, `src/lib/portal/navigation.test.ts`. Modify `src/components/layout/app-sidebar.tsx`, `header.tsx`, `property-switcher.tsx`, `notification-inbox.tsx`. Consume `src/lib/fleet/navigation.ts` and `src/lib/client-release/modules.ts` without changing their policies.

**Interfaces:** Export `getPortalNavigationGroups(context: { profile: Pick<ProfileWithAssignments, 'role' | 'isFleetAdmin' | 'canBookFleet'>; enabledModules: readonly ClientModule[] }): PortalNavigationGroup[]`. Define `PortalNavigationGroup = { title: string; items: { title: string; href: string; icon: LucideIcon }[] }` in the same file. Type-only imports from guards must not load the database into clients.

- [ ] Write meaningful visibility tests before extracting the current sidebar configuration:

```ts
import { expect, it } from 'vitest'
import { getPortalNavigationGroups } from './navigation'
it('retains staff personal rides without fleet administration', () => {
  const groups = getPortalNavigationGroups({
    profile: { role: 'staff', isFleetAdmin: false, canBookFleet: false },
    enabledModules: ['tasks', 'fleet'],
  })
  const paths = groups.flatMap(group => group.items.map(item => item.href))
  expect(paths).toContain('/fleet/my-rides')
  expect(paths).not.toContain('/dashboard')
  expect(paths).not.toContain('/fleet/dispatch')
  expect(paths).not.toContain('/admin/users')
  expect(paths).not.toContain('/surveys')
  expect(groups.every(group => group.items.length > 0)).toBe(true)
})
```

Add admin legacy-unrestricted, property-manager, fleet-booker, and fleet-admin cases; compare destination sets with the previous sidebar for each policy. Run `npx vitest run src/lib/portal/navigation.test.ts` and confirm the missing-module failure, then extract the arrays and preserve every existing visibility condition.
- [ ] Reorder destinations into the six approved groups; move fleet configuration to Administration while keeping capability gates. Keep Settings in Account, and omit empty headings. Consume groups in the existing sidebar loop; retain `setOpenMobile(false)`, route matching, sign out, and collapse controls.
- [ ] Use opaque forest sidebar, a serif wordmark, visible labels, 46px links, and sage active selection. Add a visibly labeled Menu trigger on phones, retaining the existing sidebar keyboard shortcut and drawer focus management.
- [ ] In Header/PropertySwitcher, identify property-specific routes with `useParams<{ propertyId?: string }>()`; on those routes show assigned property name or a neutral `Property workspace` fallback plus the page's canonical property heading. Do not create a client fetch to broaden property access. Display `Filter by property` only on list/dashboard pages that actually consume `propertyId` query state. Preserve current route/query selection behaviour.
- [ ] Browser-check long property names, mobile breadcrumbs, notifications, and menu closure. Run the new navigation test plus existing fleet/navigation and client-release/modules tests. Commit `feat: clarify portal navigation and property context`.

## Task 3: Reusable error feedback and unsaved-edit protection

**Files:** Create `src/components/providers/unsaved-changes-provider.tsx`, `src/hooks/use-unsaved-changes.ts`, `src/components/ui/form-error-summary.tsx`. Modify `src/app/(portal)/layout.tsx` to install the guard within the theme provider. Browser tests are added to `scripts/check-portal-ui.cjs` in Task 12 as the owning forms are updated.

**Interfaces:** `UnsavedChangesProvider({ children })`; `useUnsavedChanges(isDirty: boolean): { confirmDiscard(): boolean }`; `useUnsavedChangesNavigation(): { confirmNavigation(): boolean }`; `FormErrorSummary({ errors }: { errors: readonly { fieldId: string; message: string }[] })`. Export the navigation hook from the provider. Public/default context must remain inert.

- [ ] Add a focused browser scenario: edit a form, click a sidebar link, cancel the browser confirmation, and verify both route and entered value remain. Repeat accepting dismissal; verify a failed save does not remove the guard. Register this scenario before implementing the guard and observe its failure on current behaviour.
- [ ] Use a provider-local `Map<symbol, boolean>` in a ref for dirty registrations. Each form hook registers a stable symbol, updates its boolean in an effect, and unregisters on unmount. No localStorage, sessionStorage, server persistence, password logging, or extra state library.
- [ ] Provider listens to `beforeunload` when any entry is dirty and to document-capture clicks on same-tab navigation anchors. Exclude downloads, new tabs, modified clicks, hash-only links, and unchanged destinations. For relevant navigation ask `window.confirm('Leave this form? Your unsaved changes will be lost.')`; cancellation calls preventDefault and stopPropagation. Do not clear all registrations merely because a navigation was attempted.

Use this provider-local implementation boundary; the hook file re-exports
`useUnsavedChanges` from this provider so form owners use one consistent import:

```tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useRef,
  type ReactNode } from 'react'

type GuardContext = {
  setDirty(id: symbol, dirty: boolean): void
  remove(id: symbol): void
  confirmNavigation(): boolean
}
const inert: GuardContext = {
  setDirty: () => {}, remove: () => {}, confirmNavigation: () => true,
}
const GuardContext = createContext<GuardContext>(inert)
const message = 'Leave this form? Your unsaved changes will be lost.'

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<symbol, boolean>())
  const setDirty = useCallback((id: symbol, dirty: boolean) => {
    entries.current.set(id, dirty)
  }, [])
  const remove = useCallback((id: symbol) => { entries.current.delete(id) }, [])
  const confirmNavigation = useCallback(() =>
    ![...entries.current.values()].some(Boolean) || window.confirm(message), [])
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (![...entries.current.values()].some(Boolean)) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download ||
        (anchor.target && anchor.target !== '_self')) return
      const target = new URL(anchor.href, location.href)
      if (target.pathname === location.pathname && target.search === location.search &&
        target.origin === location.origin) return
      if (!['http:', 'https:'].includes(target.protocol)) return
      if (!confirmNavigation()) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [confirmNavigation])
  return <GuardContext.Provider value={{ setDirty, remove, confirmNavigation }}>
    {children}
  </GuardContext.Provider>
}

export function useUnsavedChanges(isDirty: boolean) {
  const context = useContext(GuardContext)
  const id = useRef(Symbol('form'))
  useEffect(() => {
    context.setDirty(id.current, isDirty)
  }, [context.setDirty, isDirty])
  useEffect(() => {
    const registration = id.current
    return () => context.remove(registration)
  }, [context.remove])
  return { confirmDiscard: () => context === inert || !isDirty || window.confirm(message) }
}

export function useUnsavedChangesNavigation() {
  const { confirmNavigation } = useContext(GuardContext)
  return { confirmNavigation }
}
```

Keep the type/value namespace distinction for `GuardContext` or rename its
type to `GuardContextValue` if lint prefers it. Test external same-tab links
too: the beforeunload handler remains the final browser safeguard.

- [ ] Extend the provider's effect to guard same-document browser Back/Forward,
  which does not fire beforeunload. Preserve Next's history state and patch
  pushState/replaceState only to add a private monotonic history index; restore
  the previous functions on cleanup. Keep the current URL, state, and index in
  refs. A capture-phase popstate handler confirms before Next's bubble-phase
  listener: accepted navigation updates the refs; cancelled navigation stops
  propagation and restores the recorded position with `history.go(delta)`.
  Suppress the restoration event without prompting twice. If a previous entry
  lacks the index, restore the recorded URL/state with the original pushState
  and leave the current React view intact. Do not replace Next's state object
  with an index-only object. The state extension and delta calculation are:

```ts
const historyKey = '__taruPortalHistoryIndex'
const withIndex = (state: unknown, index: number) => ({
  ...(state && typeof state === 'object' ? state as Record<string, unknown> : {}),
  [historyKey]: index,
})
const restoreDelta = currentIndex - destinationIndex
```

`currentIndex` and `destinationIndex` are numbers read from the recorded ref
and the popstate state extension. Add separate browser tests for cancel/accept
Back and Forward, an entry created before the provider mounted, and successful
save followed by Back. Verify React view and URL together; a prompt alone does
not prove this behaviour. The code block above defines the extension, not a
replacement for the provider's anchor/unload safeguards.
- [ ] Imperative route, property, tab, back, and dialog-close handlers call `confirmNavigation()` or the form's `confirmDiscard()` before changing state. During a save the existing busy controls prevent dismissal/duplicate requests. After successful saves reset RHF to `getValues()` or advance the controlled-state baseline before closing. Failed saves leave the baseline and values intact.

Only guard user navigation that can discard edits. Successful-save redirects
and form-internal mode changes that preserve values do not need another prompt.
For `setValue` calls that change editable values, pass `{ shouldDirty: true }`;
include independently controlled committee selections/files in the owning
form's dirty comparison. A dialog's success callback closes directly after
success; its user-dismiss handler uses `confirmDiscard()`.
- [ ] Implement the error summary using native links and focus, without owning validation:

```tsx
'use client'
export function FormErrorSummary({ errors }: {
  errors: readonly { fieldId: string; message: string }[]
}) {
  if (!errors.length) return null
  return <div role="alert" className="portal-form-errors">
    <p className="font-medium">Check these details before saving</p>
    <ul>{errors.map(error => <li key={error.fieldId}>
      <a href={`#${error.fieldId}`} onClick={event => {
        event.preventDefault()
        document.getElementById(error.fieldId)?.focus()
      }}>{error.message}</a>
    </li>)}</ul>
  </div>
}
```

Keep field errors associated with `aria-describedby` and invalid controls marked `aria-invalid`. Use persistent `role="alert"` for request failures, `role="status"` for server-confirmed completion, and Sonner for supplemental notice.
- [ ] Run the guard scenario for two simultaneously mounted dirty forms, cancelled Escape/backdrop dismissal, and saving one while the other remains dirty. Type-check and lint the new files. Commit `feat: protect unsaved edits and clarify form feedback`.

## Task 4: Administrator and property dashboards

**Files:** Modify `src/components/dashboard/consolidated-dashboard.tsx`, `consolidated-trend-chart.tsx`, `property-dashboard.tsx`, `dashboard-overview.tsx`, `date-filter.tsx`, `score-card.tsx`, `category-radar.tsx`, `comparison-chart.tsx`, `trend-chart.tsx`, `notes-feed.tsx`, `google-reviews-dashboard.tsx`, `utility-kpi-rollup.tsx`. Review dashboard page wrappers without changing query contracts.

- [ ] Apply the approved hierarchy to the existing title, filters, summary, property scores, category evidence, trends, review cards, and utility KPIs. Use a compact heading and real existing values; keep all source distinctions and selected-period context.
- [ ] Give native filter selects `portal-field` and associated labels; for example:

```tsx
<label htmlFor="feedback-source" className="portal-field-label">Feedback source</label>
<select id="feedback-source" className="portal-field" name="source" defaultValue={filters.source ?? ''}>
  {/* Keep the existing source options and submit/navigation handler. */}
</select>
```

The existing options, field names, and filter handling are retained verbatim from the component. Move lengthy score/synthesis explanations into existing accessible details disclosures. Apply 14px supporting text and readable chart axes/tooltips. Score colours continue to encode the current threshold definitions, not the preview's generic green bars.
- [ ] At 320/390/1024px and 200% zoom, verify title/filter wrapping, evidence disclosures, long review text, chart legends, no-data state, and property links. Run existing `src/lib/reviews/display.test.ts`, `consolidated.test.ts`, `trend-display.test.ts`, and `src/lib/rostering/presentation.test.ts` only if roster presentation is changed later. Commit `feat: refresh dashboard hierarchy and readability`.

## Task 5: Task Manager, projects, committees, and issues

**Files:** Modify `src/components/tasks/workspace-types.ts`, `task-workspace.tsx`, `task-detail-panel.tsx`, `task-create-dialog.tsx`, `task-committees-client.tsx`, `task-routing-client.tsx`, `tasks-area-tabs.tsx`, `task-form-dialog.tsx`, `project-form-dialog.tsx`, `projects-landing-client.tsx`, `project-card.tsx`, `task-list.tsx`, `task-board.tsx`, `task-card.tsx`, `task-meta.tsx`, `task-teams-client.tsx`, `tasks-page-client.tsx`; `src/components/issues/issues-page-client.tsx`, `issue-detail.tsx`; task/issue page wrappers.

- [ ] Keep all six existing quick views, New task, Projects, committee administration, search, URL filters, pagination, and deep-link opening. Make selected views obvious and advanced filters collapsible with the number of active filters. Reset page when filters change using existing nuqs setters.
- [ ] Extend the custom native-control class without altering exported fetch helpers:

```ts
export const inputStyle =
  'portal-field min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
```

Textarea variants keep automatic height. Add labels for inline controls and avoid styling checkboxes as text fields.
- [ ] Preserve the desktop table and introduce a mobile card representation from the same TaskRow data and click handler. Example layout boundary:

```tsx
<div className="hidden overflow-x-auto md:block">{desktopTaskTable}</div>
<div className="grid gap-3 md:hidden">{mobileTaskCards}</div>
```

`desktopTaskTable` and `mobileTaskCards` are local JSX values defined from the existing `data.items`, not new fetches. Cards include title, property, assignees, deadline, work state, and approval state as separate labels. Keep long titles wrapping. Task details use full available width on phones.
- [ ] Apply guards and field/error feedback to task/project forms and edit panels. Keep source-managed task field restrictions, pending-approval controls, file limits, comments, timeline, and committee transfer semantics. Never replace their existing policy calls with presentation checks.
- [ ] Browser-check search/filter retention after selecting/closing details, completed/overdue/awaiting-approval states, projectless tasks, empty results, long names, attachments, and cancelled dirty dialog dismissal. Run `npx vitest run src/lib/tasks/policy.test.ts src/lib/tasks/transitions.test.ts src/lib/tasks/attachments.test.ts`. Commit `feat: make task workspaces clear on desktop and mobile`.

## Task 6: Ride requests and Fleet workflows

**Files:** Modify `src/components/fleet/request-form.tsx`, `requests-table.tsx`, `dispatch-board.tsx`, `dispatch-editor-dialog.tsx`, `trip-report-dialog.tsx`, `structured-visit-report.tsx`, `visit-report-client.tsx`, `hr-confidential-feedback.tsx`, `report-template-editor.tsx`, `drivers-client.tsx`, `vehicles-client.tsx`, `distances-grid.tsx`, `vehicle-compliance-fields.tsx`, `visit-report-categories-client.tsx`, `push-setup-banner.tsx`. Review Fleet/admin-Fleet page wrappers. Preserve `driver-manifest.tsx` external styling.

- [ ] Group the existing request JSX into four named sections using semantic headings; retain every Controller/register rule, conditional branch, and existing inactive-property fallback. Add stable IDs to SelectTriggers and matching Label `htmlFor` attributes. Keep existing request-mode edit restrictions.
- [ ] Add RHF `isDirty` to the existing form-state destructure and register the guard. Maintain a request error string independently from toast; use the RHF invalid callback for the error summary. Example pattern:

```tsx
const [submitError, setSubmitError] = useState('')
const { confirmDiscard } = useUnsavedChanges(isDirty)
// Existing onSubmit begins with setSubmitError(''); its catch sets submitError.
<form onSubmit={handleSubmit(onSubmit, () => {
  // RHF focuses the first registered invalid field; Controllers receive field.ref.
  setSubmitError('Check the highlighted fields before submitting your ride request.')
})}>
  {submitError && <p role="alert" className="portal-form-errors">{submitError}</p>}
  {/* Existing fields remain connected to their register/Controller handlers. */}
</form>
```

Pass dirty dismissal to the owning request dialog. After server success clear/reset form state before `onSuccess`; on failure preserve values. Keep capacity/date validation and task linkage. Report ownership retains the 48-hour instruction. Use Submit ride request and Save ride request labels with pending-state text.
- [ ] For native structured reports and grids, add `portal-field`, associated labels/units, inline correction feedback, and controlled-value dirty baselines. Preserve HR confidentiality, report-specific fields, photo/file handling, report locks, and task-producing transitions. Add `confirmNavigation()` to imperative tab/record changes.
- [ ] Browser-reproduce empty submission, reversed dates, failed network save, visit→other-trip switching, other pick-up, existing/new task, no eligible tasks, edit an inactive selected property, and cancelled dirty close. Mock write responses locally; never submit test trips to the shared database. Verify dispatch grids have contained scrolling and readable row headings.
- [ ] Run existing Fleet `constraints`, `navigation`, `dates`, `labels`, `reports`, `vehicle-compliance`, and structured-report `model`/`hr` unit tests. Type-check. Commit `feat: simplify ride requests and fleet forms`.

## Task 7: Surveys, SOPs, and template editors

**Files:** Modify `src/components/surveys/new-survey-wizard.tsx`, `survey-form.tsx`, `survey-filters.tsx`, `survey-score-display.tsx`, `surveys-area-tabs.tsx`, `copy-link-button.tsx`, `delete-survey-button.tsx`; `src/components/sops/my-sops-client.tsx`, `sop-completion.tsx`, `sop-dashboard-client.tsx`, `sop-categories-management.tsx`, `sops-area-tabs.tsx`; `src/components/admin/template-builder.tsx`, `template-actions.tsx`, `sop-builder.tsx`, `sop-assignments.tsx`, `sop-multi-assign-dialog.tsx`, `guest-link-dialog.tsx`.

- [ ] Make setup steps and selected property/template clear. Associate every select and date label; keep ratings, notes, required questions, current draft-save semantics, and survey task creation. Show progress using existing completion information, never fabricated estimates.
- [ ] Give notes explicit editable-field surfaces. Keep score scales and low-score issue prompts. Add readable error summaries and guards to existing unsaved sections without disrupting successful existing draft saves. Example notes layout:

```tsx
<div className="space-y-2">
  <Label htmlFor={noteId}>Notes <span className="portal-help">Optional</span></Label>
  <Textarea id={noteId} aria-describedby={`${noteId}-help`} {...existingNoteBindings} />
  <p id={`${noteId}-help`} className="portal-help">Add context for the team reviewing this assessment.</p>
</div>
```

Define `noteId` from the existing question ID and reuse that field's current RHF bindings as `existingNoteBindings`; these names are local to the modified question component. Keep every question's existing description and validation intact.
- [ ] SOP checklists use clearly tappable labeled rows and explicit complete/incomplete state; template editors preserve category/subcategory ordering, weights, assignments, and editor controls. Guards include template switching and closing multi-assignment dialogs.
- [ ] Browser-check short/long templates, empty templates, partial completion, score extremes, required missing notes/issues, draft save success/failure, and dirty switching. Verify the public guest-survey component remains unthemed. Type-check and commit `feat: clarify surveys checklists and template editing`.

## Task 8: Daily Records, utility readings, and waste

**Files:** Modify `src/components/daily-records/daily-records-page-client.tsx`; `src/components/admin/utilities-page-client.tsx`, `utility-reading-form.tsx`, `utility-readings-table.tsx`, `utility-range-selector.tsx`, `utility-slot-config-form.tsx`, `utility-tier-form.tsx`, `utility-kpi-bands-form.tsx`, `utility-summary-cards.tsx`, `utility-charts.tsx`; `src/components/waste/waste-page-client.tsx`, `waste-log-form.tsx`, `waste-log-table.tsx`, `waste-summary-cards.tsx`, `waste-charts.tsx`. Preserve `src/components/utilities/public-reading-form.tsx` public defaults.

- [ ] Remove duplicate page padding, make property/date context prominent, and retain the consolidated Water/Electricity/Daily Wastage tabs and their URL state. Use the navigation guard before tab/property/back changes.
- [ ] Place readings in named sections with visible units, required/optional cues, and associated help. Preserve photo/OCR, slot-window auto-fill, calculations, tiers, occupancy, and all existing API fields. Use naturally paired fields with this responsive boundary:

```tsx
<div className="grid gap-4 sm:grid-cols-2">
  {existingReadingFields}
</div>
```

`existingReadingFields` is the local JSX extracted unchanged from the current form's registered fields before adding label/help attributes. Mobile starts with one column; dense comparison tables scroll inside their own region.
- [ ] Add inline request errors, success feedback, and guards to reading/config/waste forms; successful save updates their existing baseline/reset behaviour. Keep KPI thresholds and chart legends readable, not recoloured into new semantic bands.
- [ ] Browser-check decimal values, dates, visible units, missing readings, incomplete OCR, long records, and failed saves. Run `npx vitest run src/lib/daily-records/tabs.test.ts` and applicable current utility/Fleet unit checks. Commit `feat: improve daily recording and utility readability`.

## Task 9: Rostering, asset records, and scanning

**Files:** Modify `src/components/rostering/rostering-home.tsx`, `roster-preview.tsx`, `roster-matrix.tsx`, `day-inspector.tsx`, `forecast-grid.tsx`, `assignment-edit-dialog.tsx`, `unavailability-manager.tsx`, `profile-link-manager.tsx`, `import-panel.tsx`, `roster-workflow-controls.tsx`; `src/components/assets/asset-dashboard.tsx`, `asset-detail.tsx`, `asset-directory.tsx`, `asset-form.tsx`, `asset-quick-view.tsx`, `assets-area-tabs.tsx`, `rooms-manager.tsx`, `qr-scanner.tsx`; `src/app/(portal)/rostering/[cycleId]/print/page.tsx`. Keep `print-button.tsx` and `asset-qr-label.tsx` working.

- [ ] Keep the roster matrix as a matrix with readable employee/day headings and contained horizontal scrolling. Improve legend, selected cell, day inspector, forecast units, import preview/errors, approval actions, and mobile employee/day details. Retain employee linking, warnings, eligibility, and deterministic engine semantics.
- [ ] Improve asset directory/form hierarchy, condition/status labels, room selection, financial visibility, and QR/scan actions. Keep cameras and scanning logic intact. Apply guards and inline feedback to asset, room, availability, assignment, forecast, import, and profile-link edits.
- [ ] Label intentionally scrollable regions and prevent page-wide overflow:

```tsx
<div role="region" aria-label="Roster by employee and day" className="max-w-full overflow-x-auto">
  {existingRosterTable}
</div>
<p className="portal-help md:hidden">Swipe across to see more days. Select a shift to view its details.</p>
```

`existingRosterTable` is the current table JSX including its selection handlers. On keyboard use, controls inside the table remain reachable in native tab order; no new positive tab indices.
- [ ] Browser-check long names, large months, import errors, no assignments, no camera permission, financial-hidden staff views, and 320px scanning controls. Print-preview a roster and QR label. Run applicable roster and asset non-integration unit suites. Commit `feat: refresh roster and asset workflows`.

## Task 10: Property content, administration, and authentication

**Files:** Modify `src/components/guest-profiles/guest-profiles-page-client.tsx`; `src/components/admin/menus-page-client.tsx`, `menu-meta-form.tsx`, `menu-category-form.tsx`, `menu-item-form.tsx`, `menu-item-card.tsx`, `excursions-page-client.tsx`, `excursion-form.tsx`, `excursion-card.tsx`, `cover-image-input.tsx`, `properties-page-client.tsx`, `property-card.tsx`, `property-form.tsx`, `user-table.tsx`, `user-invite-form.tsx`, `user-edit-form.tsx`, `allowed-emails-page-client.tsx`, `bulk-import-card.tsx`; `src/components/auth/login-form.tsx`, `set-password-form.tsx`; `src/app/(portal)/settings/page.tsx`, `properties/page.tsx`.

- [ ] Apply consistent page title/purpose/action structure, property-aware lists, visible editing fields, grouped related questions, and associated labels. Replace light hard-coded surfaces within portal content; keep image previews and intentional photo backgrounds.
- [ ] Keep desktop admin sorting/filtering/pagination; mobile records use readable stacked cards with explicit edit/invite actions. Example card container:

```tsx
<article className="rounded-xl border bg-card p-4">
  <h2 className="text-base font-medium">{user.fullName}</h2>
  <p className="portal-help break-words">{user.email}</p>
  <div className="mt-3 flex flex-wrap items-center gap-2">{existingRoleAndActiveBadges}</div>
  <Button variant="outline" className="mt-4" onClick={() => setEditUser(user)}>Edit user</Button>
</article>
```

Use the current component's user/edit-state names, badges, and action permission conditions; do not duplicate mutation code between table and cards. Preserve invitations, allowed emails, property assignments, bulk-import preview/commit distinction, Oracle refresh/sync, and image handling.
- [ ] Add guards and form feedback to property, content, user, email, settings, and import editors. Role/assignment selects use real labels and clear constraints. Auth forms retain their invite-only/self-service differences, Supabase calls, routes, and error mapping; use warm scoped surfaces and readable password requirements.
- [ ] Browser-check admin edit on desktop/phone, long email/name, disabled user, multiple assignments, empty allowed-email list, failed invitation/import, dirty dismissal, login error, and password setup. Mock all mutation requests during UI verification; do not send invitations or trigger sync jobs. Run existing auth `client-access`, `invitations`, `callback`, and organization-scope tests. Commit `feat: make administration and property editing approachable`.

## Task 11: Complete route and native-control coverage

**Files:** Review all `src/app/(portal)/**/page.tsx` files and component ownership in Tasks 4–10; modify only wrappers still carrying inconsistent headings/padding or native fields. Update `docs/runbooks/portal-ui-acceptance.md` with an explicit row for each route. No API/schema edits.

- [ ] Generate the route inventory and native-control audit from the current checkout:

```bash
rg --files 'src/app/(portal)' -g page.tsx | sort
rg -n '<(input|textarea|select)\b' src/components
rg -n 'bg-white|bg-transparent|glass|text-\[1[012]px\]' src/components 'src/app/(portal)'
```

Treat each match as a review item, not an automatic replacement. Public components, checkbox/radio/file controls, chart ticks, print documents, and intentionally dense grids have specific exceptions. Record the reason for retained exceptions in the runbook.
- [ ] Record coverage for these route families: admin properties/users/allowed-emails and Fleet configuration; assets root/dashboard/directory/new/detail/edit/rooms/scan plus scan/asset; daily-records and property daily-records/utilities/waste; dashboard root/property; menus/excursions/guest-profiles root/property; tasks root/projects/project details/committees/routing/teams and issues list/detail; Fleet root/my-rides/dispatch/vehicle details/report; rostering root/setup/approvals/cycle/print and my-roster; surveys root/new/detail/slug/templates/new/template; SOPs root/dashboard/categories/templates/new/template; properties; utilities; waste; settings.
- [ ] For every route record role, enabled-module profile, edited owner, fields, layout size, error/success states, and verification status. A route with only shared style changes still needs review. Mark unavailable authenticated states as unverified rather than manufacturing successful checks.
- [ ] Remove duplicated page padding, identify one primary title per view, and label remaining icon-only actions. Where server wrapper JSX owns a form/title, use the same scoped classes:

```tsx
<section className="min-w-0 space-y-6">
  <header className="space-y-2">
    <h1 className="portal-page-title">{existingPageTitle}</h1>
    <p className="portal-help">{existingPageDescription}</p>
  </header>
  {existingPageContent}
</section>
```

Keep server queries, guards, and `force-dynamic` exports untouched. Audit runtime dark appearance, reduced motion, print, PWA connectivity notice, file inputs, and all body-portalled overlays. Commit `feat: complete portal redesign coverage` after focused checks.

## Task 12: Whole-portal validation and review handoff

**Files:** Create `scripts/check-portal-ui.cjs`, `docs/runbooks/portal-ui-acceptance.md`. Keep fixture screenshots/reports in a task-owned output directory, without committing guest/staff personal information. Existing tests remain the business-regression suite.

**Interfaces:** Script reads `PORTAL_UI_BASE_URL` (default `http://localhost:3000`) and `PORTAL_UI_PLAYWRIGHT_PATH` (bundled Playwright package path supplied by workspace-dependencies tool). Optional `PORTAL_UI_STORAGE_STATE` points to a local authenticated browser state file; never commit or print its contents. Script refuses non-loopback origins. It does not seed data, create users, send messages, or permit unmocked mutation requests.

- [ ] Implement the local browser harness using the existing bundled runtime, not a package installation:

```js
const { chromium } = require(process.env.PORTAL_UI_PLAYWRIGHT_PATH)
const base = new URL(process.env.PORTAL_UI_BASE_URL || 'http://localhost:3000')
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
  throw new Error('UI checks require a local app origin')
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  storageState: process.env.PORTAL_UI_STORAGE_STATE || undefined,
})
await context.route('**/api/**', async route => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
  return route.fulfill({ status: 409, contentType: 'application/json',
    body: JSON.stringify({ error: 'UI verification: server writes are blocked' }) })
})
```

Wrap CommonJS async work in an async function with `try/finally` that closes the browser. Add route-specific mock successes only for the form being checked. Route interception does not block server-side actions, external invitation/sync calls, or browser SDK traffic: do not trigger those actions, and intercept their external mutation routes when explicitly testing auth. Use isolated local accounts/data for real-role checks; the existing dev bypass supplies only an admin and cannot establish staff/manager results.
- [ ] Assert browser interactions rather than class strings. Representative checks:

```js
await page.getByRole('button', { name: 'New task', exact: true }).first().click()
await page.getByLabel('Task', { exact: true }).fill('UI verification task')
page.once('dialog', dialog => dialog.dismiss())
await page.keyboard.press('Escape')
if (!await page.getByRole('dialog').isVisible()) throw new Error('Dirty task was discarded')
if (await page.getByLabel('Task', { exact: true }).inputValue() !== 'UI verification task') {
  throw new Error('Entered task title was lost')
}
```

Keep selectors aligned with the unchanged existing title/primary actions and new accessible labels. Cover Task 1 portalled theme and keyboard tests; Task 2 role/navigation cases; Task 3 guard cases; Task 6 form branches; long strings, 320px, 390px, 768px, 1024px, and 200% zoom; all public defaults. Measure overflow on the workspace and each view. Allow only explicitly designated table/grid regions to scroll horizontally.
- [ ] Run static/business checks:

```bash
npx tsc --noEmit
npx vitest run --exclude '**/*.integration.test.ts'
npm run build
git diff --check
```

Run ESLint on the actual changed TypeScript files. Record pre-existing failures separately; fix failures caused by this change. Run database integration suites only with a dedicated test database and their existing bootstrap rules; UI-only changes do not justify running write-based integration tests against the shared database.
- [ ] Validate navigation against three real configured policies: legacy unrestricted; Client 1 `dashboard,tasks,surveys,fleet`; checked-in Taru release `dashboard,tasks,fleet,daily-records`. The last profile is verified by `src/lib/client-release/taru-release.test.ts`; do not replace it with the Client 1 list. Do not change the repository's deployment profile to test a different one.
- [ ] Inspect actual desktop/phone screenshots, dark companion tokens, focus visibility, drawer/dialog focus return, labels, error announcements, keyboard access, contained grid scroll, print layouts, and PWA online/offline feedback. Record every unresolved role/data limitation.
- [ ] Prepare the usability runbook for a representative administrator, property manager, and staff member: find an action, fill a form, correct a missing field, recognize pending approval, and identify successful saving. Record unassisted completion, observed confusion, and before/after time. Actual staff review remains a human acceptance step and is never claimed from automated checks.
- [ ] Review the whole change against the approved spec; verify all route rows have a disposition, no public theme leakage, no sample preview data in the app, and no permission/score/validation changes. Commit `test: document portal redesign acceptance checks`. Present finished code, screenshots, check results, and any unverified states for release review; keep production promotion pending.

## Plan self-review

- Every spec area maps to Tasks 1–12: tokens/overlays (1), navigation/property context (2), confidence/error/dirty states (3), administrator landing (4), other-role landing/task administration (5), representative Fleet form (6), surveys/SOPs (7), readings (8), specialized rosters/assets/print (9), content/admin/auth (10), remaining route wrappers (11), responsive/accessibility/PWA/public/release acceptance (12).
- Interfaces are defined before use; hooks do not replace domain validation or server permissions. Existing component-specific state/JSX names in examples are adapted locally, not introduced as shared APIs.
- Review Focus has an owning behavioural check for every item. No CSS-only test suite, dependency installation, schema migration, new dashboard dataset, or production write is planned.
- The approved preview is a visual reference. The implementation preserves real New task actions, filters, fields, source distinctions, and request rules even where the simplified preview omitted them.
- Execution waits for Sonal's review of this plan and selection of Native or subagent-driven execution.
