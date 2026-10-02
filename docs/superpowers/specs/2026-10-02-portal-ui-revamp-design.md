# Taru Villas portal UI revamp

Status: approved by Sonal on 2 October 2026, including the written design and
interactive preview. Product implementation begins after review of the
implementation plan and selection of the execution method.

## Purpose and audience

The user feedback is that the portal feels uninviting, contains too much white,
and does not clearly identify editable fields. The intended outcome is a portal
that people who dislike using software can confidently use every day.

Administrators, property managers, and staff receive equal design attention.
Equal attention means consistent quality and ease of use across authorized
workflows, with the right density and actions for each role. It does not mean
identical landing screens or permissions.

Success means that a person can identify their current page and property, find
the next action, distinguish editable fields from information, correct mistakes,
and recognize a successful save without needing a colleague to explain it.

## Evidence from the current app

- `src/app/globals.css` defines identical white background and card surfaces.
- Shared input, textarea, and select controls have transparent backgrounds,
  pale borders, and mostly 36px control heights.
- Header, navigation, dialogs, and cards use translucent glass treatments.
- The sidebar separates Main, Fleet Management, Property Content, and Setup,
  but everyday work and configuration still compete for attention.
- The current root route sends administrators to `/dashboard` and other users
  to `/tasks`. The implementation must follow the live guards and routes rather
  than older role tables in historical project documentation.
- Task Manager already has open, assigned-to-me, overdue, awaiting-approval,
  completed, and all-task views, together with URL-backed filters and a detail
  panel. These are valuable workflows to retain.
- Fleet requests already distinguish property visits from other trips, require
  a task reason at creation, and include report ownership, pick-up, dates,
  passenger count, cargo, and notes. The redesign must express these rules.
- There are 64 authenticated portal page files, covering substantially more
  than the four modules enabled in the narrower Client 1 deployment profile.

## Selected design direction

Use the feeling of a calm hospitality workspace: warm cream surrounding the
work, forest green anchoring navigation and actions, sage giving sections
definition, and white identifying places to enter information. The interface
should feel familiar and composed. Large decorative imagery, welcome banners
that push work below the fold, and decorative animation are unnecessary.

Alternatives considered were a brighter multicolour workspace and a heavily
guided wizard interface. The approved direction supplies warmth while keeping
routine work fast. Longer forms may use steps when those steps reflect real
dependencies; short forms remain on one screen.

### Core light palette

| Purpose | Colour | Use |
| --- | --- | --- |
| Workspace | `#F3EFE6` | Main canvas |
| Content surface | `#FAF8F3` | Cards, forms, tables, dialogs |
| Editable field | `#FFFFFF` | Inputs, textareas, selects |
| Forest | `#244D3E` | Navigation, primary actions, focus |
| Main text | `#273D34` | Headings, labels, body text |
| Secondary text | `#59645B` | Supporting text and instructions |
| Sage | `#E5EDDF` | Section headings and subtle active backgrounds |
| Surface divider | `#D5DCCF` | Structural separation |
| Field boundary | `#7A8476` | Visible editable-control borders |
| Error | `#A33E30` | Field errors and destructive actions |
| Warm accent | `#86591C` | Restrained highlights with explicit labels |

Calculated sRGB contrast: main text on cream 10.15:1, secondary text on content
surface 5.82:1, white on forest 9.52:1, field border against white 3.90:1,
field border against content surface 3.67:1, and error text on white 6.38:1.
These are token checks, not a claim of complete accessibility conformance.
Final states and composed surfaces require browser validation.

### Typography and spacing

- Keep the existing Geist sans font for controls, labels, and body copy.
  Use a restrained system serif for major page titles and the brand wordmark
  to introduce hospitality character without additional font downloads.
- Body and editable text are 16px; desktop secondary metadata is 14px.
  Avoid tiny metadata for information needed to act.
- Page headings are approximately 28–32px, with a short purpose statement.
- Use a consistent 4px spacing scale, 16–24px content padding, and 12px field
  radii. Controls are 44–48px high in ordinary forms.
- Dense administrative tables may have tighter row spacing; essential text
  and touch targets remain readable and usable.
- Limit long-form reading width. Tables and charts can use the full desktop
  workspace; short forms should not stretch edge to edge.

## Application shell and navigation

Use an opaque forest-green sidebar with a clear wordmark, labeled links,
visible section headings, and a strong selected-page treatment. Desktop starts
with labels visible. Mobile uses a labeled Menu action and a drawer whose links
close it after selection. Keep the existing keyboard and focus behaviour.

Group existing destinations by purpose:

| Group | Existing destinations |
| --- | --- |
| Overview | Administrator dashboard |
| Daily work | Task Manager, Surveys, SOPs, Daily Records, My Roster |
| Property operations | Asset Registry, Rostering, Guest Profiles, Menus, Excursions |
| Transport | My Rides, All Ride Requests, Dispatch |
| Administration | Property Settings, Users, Allowed Emails, fleet configuration |
| Account | Settings, profile, sign out |

Group membership does not grant permission. Filter every destination using the
existing role, fleet capability, assignment, and enabled-module rules. Omit
empty groups. Preserve route names and deep links; rename only visible group
headings. Retain specialized area tabs for settings within each module.

The header uses an opaque light surface, a readable current-page name or
breadcrumb, notifications, and explicit property context. Where property is a
filter, label it as such. On property-specific routes, show the route's property
as context instead of implying that an unrelated query-string picker can change
the form destination. Do not silently change a form's selected property.

## Landing experiences and page hierarchy

Administrators continue to land on `/dashboard`. Present the existing feedback
score, evidence counts, property comparison, and selected-period context in a
clear overview. Source and synthesis explanations remain accessible through
details disclosures rather than dominating the first screen. Keep all score
definitions, source distinctions, and existing utility KPI information.

Managers and staff continue to land on Task Manager. Make the existing
assigned-to-me and awaiting-approval views easy to discover; authorized work
and its next action are the focus. Do not invent daily summaries, new counts,
automatic task defaults, or extra dashboard data sources as part of the UI work.

Every page follows the same hierarchy: title, concise purpose/context, primary
action, local tabs/filters, content, and optional supporting explanations.
Existing primary actions remain visible. Status terms match the business state.

## Forms and feedback

### Editable-control contract

Each editable field has a persistent, programmatically associated label, a
solid white fill, a visible boundary, sufficient padding, and a green focus
outline. Textareas have a useful initial height. Selects use the same visual
language and display their current selection clearly.

Mark Required or Optional in plain text on forms where users need this cue.
Examples and formats appear in associated help text. Placeholders can add a
hint but never replace a label. Numeric fields visibly identify their units.
Show read-only values as labeled information instead of visually editable inputs.
Explain unavailable choices or disabled actions when the reason is actionable.

Use short named sections for related fields. Show two columns only for naturally
related short fields and only at widths where they remain comfortable. Stack on
small screens. Dependent fields appear next to the selection that controls them.
Defaults must be existing, valid, and visible; do not introduce defaults that
change business meaning.

### Submission and correction

- Prefer action-specific labels: Save task, Submit ride request, Save readings.
- During submission, disable duplicate submission and show Saving or Submitting.
- On failure, retain values and show a persistent, actionable inline message.
  Field validation identifies the affected field and explains the correction.
- For long forms, show an error summary with links to invalid fields and move
  focus appropriately. Hidden dependent fields must not block submission.
- Show successful server-confirmed completion with clear feedback in context.
  Reuse Sonner as supplemental feedback. Never say Saved while a request failed
  or remains in flight; submitting a ride does not mean it has been approved.
- In a successful dialog workflow, close the dialog only after success and show
  confirmation in the refreshed list or page. Preserve the user's filters.
- Cancelling or navigating away from dirty forms warns before discarding edits.
  No automatic saving, draft persistence, or offline queue is added by this work.
- Preserve destructive confirmations and make consequences specific.

### Representative ride-request design

Group the existing form into Trip details, Task reason, People and timing, and
Additional information. Keep the Property visit/Other trip distinction visible.
Include property or destination, pick-up and conditional custom location,
existing-task/new-task choice, conditional project, report owner, start/end
dates, passengers, cargo, purpose and notes. Preserve the API's validation,
edit-mode restrictions, and report deadline. A review strip can repeat the
selected values before submission without adding a mandatory wizard step.

## Lists, task details, and administrative work

Task Manager retains its existing filters and quick views. Use readable labels
and selected states, a clear search field, and an expandable advanced-filter
area with an active-filter indicator. Preserve URL state and pagination.

On desktop, use structured table rows and a detail panel. On narrow screens,
show task cards with title, property, approval/work status, assignee, and deadline;
the detail panel takes the available screen width. Supplementary metadata lives
in the detail view. Approval, progress, and priority remain distinct concepts.
Preserve committee decisions, transfer restrictions, comments, attachments,
history, notifications, and all server permissions.

User and property administration retain sortable, filterable tables on desktop.
Give add/invite/edit actions text labels. Use clear role, active, and assignment
states. On mobile, present records as cards when practical; complex comparison
tables may use contained horizontal scrolling with an explicit affordance.
Never shrink the entire desktop table to fit a phone.

## Coverage across the full portal

| Area | Design application |
| --- | --- |
| Dashboard and property dashboards | Evidence hierarchy, readable KPIs, filters, charts, source detail |
| Tasks, projects, committees, routing, issues | Quick views, clear decisions, details, form feedback |
| Surveys and templates | Setup clarity, labeled scoring/notes, progress, existing draft/submit flows |
| Fleet, dispatch, reports, vehicles, drivers | Grouped request/report forms, decision/status clarity, readable boards |
| SOPs and templates/categories | Clear checklist rows, completion states, creation/edit forms |
| Daily records, utilities, waste | Grouped readings, visible units, dates, instructions and save feedback |
| Rostering, approvals, setup, My Roster | Legible matrices, clear filters/actions, mobile detail views |
| Assets, rooms, directory, scanning | Clear records/forms, financial visibility rules, scan actions |
| Guest profiles, menus, excursions | Property context, manageable lists, defined editing controls |
| Properties, users, allowed emails, settings | Readable admin records, invitations, assignments, account actions |
| Login and password setup | Matching warmth and defined fields with existing auth flow |

Roster matrices, dispatch grids, rich template editors, and scanning interfaces
need tailored layouts; generic card replacement must not reduce their utility.
Print views retain print-appropriate surfaces and remove portal chrome.

## Component and style architecture

Keep Next.js, shadcn/Radix, Tailwind, Lucide, React Hook Form, nuqs, Recharts,
Sonner, and the existing fetching/mutation contracts. No dependency additions
or database migrations are required for this design.

Introduce portal-scoped theme tokens and apply them through the authenticated
layout and matching auth surfaces. Shared UI primitives retain compatible public
defaults. Explicitly propagate the portal scope to Radix content rendered in
body portals and to notifications so dialogs, popovers, menus, and selects match
the surrounding application. Do not rely only on an ancestor selector that is
absent after portalling.

Refine existing primitives and layout components before updating module-specific
markup. The custom task workspace also uses native inputs/selects and local
styles, so it must receive equivalent field and focus treatment. Inventory
native controls and hard-coded light surfaces across all modules during planning.

Use shared page, field, and status conventions where repetition exists. Keep
domain validation and business state in their current components and server
layers. Do not introduce a generic form engine or new global state store.

Public guest surveys, menus, excursions, utility links, driver manifests, and
other external pages retain their intentional designs. Theme scope must ensure
that changing shared primitives does not unintentionally recolour those pages.
Existing dark styling remains supported by defining readable companion portal
tokens; adding a theme-switching product feature is outside this revamp.

## Accessibility and responsive behaviour

Target WCAG 2.2 AA: readable contrast, associated labels/instructions, visible
keyboard focus, logical heading order, meaningful names, accessible error and
success feedback, and keyboard-operable dialogs, tabs, selects, and drawers.
Use approximately 44px touch targets where practical and 16px editable text on
mobile. Colour supplements explicit status words or icons; it is never the only
way to distinguish approval, urgency, or completion.

Support 320–390px phones, tablets, 1024px desktops, and wider administrative
workspaces. Validate 200% zoom and reduced motion. Sticky controls must not cover
the focused field, final record, mobile keyboard area, or error message. Existing
print and PWA behaviour must remain usable.

Reference guidance:
- https://www.w3.org/WAI/tutorials/forms/labels/
- https://www.w3.org/WAI/tutorials/forms/instructions/
- https://www.w3.org/WAI/tutorials/forms/notifications/
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

## Validation and rollout

Implementation starts with the shared shell/controls and the three approved
representative flows: administrator dashboard, Task Manager, and ride-request
form. Extend the system across the coverage table before claiming the full
revamp complete. This is sequencing within one revamp, not a reduced scope.

Run TypeScript and production build checks, relevant existing tests, focused
lint, and browser checks. Add behavioural tests only where interaction changes
need protection, such as accessible form validation, dirty-form dismissal, or
mobile navigation. Visual styling does not need tests that repeat CSS classes.

Check admin, property-manager, staff, and fleet-capability views against the
existing server permission and enabled-module rules. Verify the legacy module
profile and the narrower dashboard/tasks/surveys/fleet profile. Confirm public
pages and print views retain their intended appearance.

Use representative users from each role for a usability review: find an action,
complete a form, correct a missing field, identify a pending approval, and
recognize a successful save. Aim for unassisted completion; collect observed
confusion and task times before and after. These checks require real users and
cannot be reported as passed by a design preview or automated browser run.

Develop on the current `main` checkout. The finished implementation must be
reviewed before promotion to `taru-release` or a production deployment, consistent
with the existing release boundary. No external publication is part of the
design stage.

## Design preview

The accompanying conversation preview demonstrates the proposed shell,
administrator feedback overview, task quick views/detail, and grouped ride
request. Its records and counts are explicitly sample data. It is a design
artifact with local interactions, not a connected application or evidence that
the production revamp is implemented.

Preview verification on 2 October 2026: local Chrome checks found no horizontal
overflow in the dashboard and ride form at browser widths of 320, 390, 736, and
1080px. Task quick views, search, opening details, required-field/date correction,
conditional trip/task/pick-up fields, local confirmation, and mobile navigation
passed with no JavaScript runtime errors. Desktop dashboard/task views and the
phone form were visually inspected. This does not verify production permissions,
server persistence, the remaining modules, or usability with actual staff.
