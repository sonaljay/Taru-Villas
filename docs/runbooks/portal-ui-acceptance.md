# Portal UI acceptance — 2 October 2026

The approved redesign uses a cream workspace, forest navigation, clear white editing surfaces, larger controls, grouped forms and persistent correction feedback. It covers administrator, manager and staff destinations through the existing permission and module policies. No API, schema, auth policy, score threshold or deployment profile was changed.

## Automated verification

- TypeScript: `npx tsc --noEmit` passed.
- Business and presentation regression suite: **53 suites / 356 tests passed**; `npx vitest run --exclude '**/*.integration.test.ts'`. Integration suites that write to a database were deliberately excluded.
- Production compilation: `npm run build` passed. The existing Geist fonts require network access during this build.
- ESLint: actual changed/new TypeScript files and `scripts/check-portal-ui.cjs`; no errors. Existing image, unused-variable and dependency warnings are retained outside this UI scope.
- Browser: `scripts/check-portal-ui.cjs`, headless Chrome, disposable local PostgreSQL fixtures, all mutation requests intercepted. Service workers are blocked in the test context so they cannot bypass interception.
- 44 routes without record parameters: one primary heading and no document overflow at 390 and 1440 pixels (88 route observations).
- Tasks, dashboard, Fleet, users, Daily Records, assets, rostering and login: no document overflow at 320, 390, 768, 1024 and 1440 pixels.
- Task failed save, Escape cancellation, project Cancel cancellation, history Back/Forward, mobile sidebar, ride correction links, user failed save, roster tab cancellation and attachment/comment isolation have interaction checks. Their pending/failure values remain in the form.
- Dark companion surfaces, reduced-motion rendering, print header removal, offline notice and public `/u/`, `/m/`, `/e/` theme isolation are checked locally. This does not certify service-worker update delivery, camera hardware or a complete printed roster.

The original local dev bypass uses a non-UUID user ID and could not render task queries. Browser QA uses a disposable copy with a valid fixture ID; the product auth guard remains unchanged. Before screenshots of the authenticated working baseline were therefore unavailable. Sample preview data is confined to the disposable database/browser mocks and is absent from application source.

## Reproduce locally

Use an isolated local server/database and a signed-in fixture account. Supply the existing bundled Playwright path; no package installation is required.

```sh
PORTAL_UI_BASE_URL=http://localhost:3000 \
PORTAL_UI_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
PORTAL_UI_ROUTE_AUDIT=1 \
node scripts/check-portal-ui.cjs
```

The harness refuses non-loopback origins. Optional `PORTAL_UI_STORAGE_STATE` is a private local authenticated state file; do not commit it. `PORTAL_UI_OUTPUT` selects an output directory (default `/private/tmp/taru-portal-ui-checks`). `PORTAL_UI_INTERACTIONS_ONLY=1` skips screenshot-width loops. The complete interactions assume an isolated account with at least one active property, project and eligible vehicle. Do not use shared accounts or trigger invitation, Oracle refresh/sync, bulk-import commit or external auth actions during UI QA. API interception does not protect server actions; those are not exercised.

## Route coverage

`legacy` means unrestricted modules; `client1` means dashboard/tasks/surveys/fleet; `taru` means dashboard/tasks/fleet/daily-records. Core administration keeps its existing policy. The checked-in development deployment profile remains unchanged. Staff/manager destinations and Fleet privilege combinations are covered by pure navigation/policy tests; real signed-in staff and manager sessions remain unverified.

Every row receives the shared scoped theme; listed owners retain their existing validation, query and permission contracts. `Runtime layout` means sample admin/empty-data rendering, not every possible record state. Dynamic record routes need real isolated fixtures for complete runtime acceptance.

| Route | Existing guard | Module / profiles | Owner | Fields / states | Verification |
| --- | --- | --- | --- | --- | --- |
| `/admin/allowed-emails` | [admin] | allowed-emails / legacy | admin/allowed-emails-page-client | Email list and existing actions | Runtime layout 390/1440; full record states unverified |
| `/admin/fleet/distances` | [admin] | fleet / legacy, client1, taru | fleet/distances-grid | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/admin/fleet/drivers` | [admin] | fleet / legacy, client1, taru | fleet/drivers-client | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/admin/fleet/vehicles` | [admin] | fleet / legacy, client1, taru | fleet/vehicles-client | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/admin/fleet/visit-report-categories` | [admin] | fleet / legacy, client1, taru | fleet/report-template-editor, fleet/visit-report-categories-client | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/admin/properties` | [admin] | core / legacy, client1, taru | admin/properties-page-client | Existing administration or account fields | Runtime layout 390/1440; full record states unverified |
| `/admin/users` | [admin] | core / legacy, client1, taru | admin/user-table | Existing administration or account fields | Runtime layout 390/1440; full record states unverified |
| `/assets/[id]/edit` | [admin, property_manager] | assets / legacy | assets/asset-form | Search, asset/room fields, scan actions | Unverified record state; static owner/theme review |
| `/assets/[id]` | Authenticated; existing record/property checks | assets / legacy | assets/asset-detail | Search, asset/room fields, scan actions | Unverified record state; static owner/theme review |
| `/assets/dashboard` | [admin, property_manager] | assets / legacy | assets/asset-dashboard | Search, asset/room fields, scan actions | Runtime layout 390/1440; full record states unverified |
| `/assets/directory/new` | [admin, property_manager] | assets / legacy | assets/asset-form | Search, asset/room fields, scan actions | Runtime layout 390/1440; full record states unverified |
| `/assets/directory` | Authenticated; existing record/property checks | assets / legacy | assets/asset-directory | Search, asset/room fields, scan actions | Runtime layout 390/1440; full record states unverified |
| `/assets` | Authenticated; existing record/property checks | assets / legacy | server wrapper / redirect | Search, asset/room fields, scan actions | Runtime layout 390/1440; full record states unverified |
| `/assets/rooms` | [admin, property_manager] | assets / legacy | assets/rooms-manager | Search, asset/room fields, scan actions | Runtime layout 390/1440; full record states unverified |
| `/assets/scan` | Authenticated; existing record/property checks | assets / legacy | assets/qr-scanner | Search, asset/room fields, scan actions | Runtime layout 390/1440; full record states unverified |
| `/daily-records` | Authenticated; existing record/property checks | daily-records / legacy, taru | ui/card | Date, readings, units, waste; tab context | Runtime layout 390/1440; full record states unverified |
| `/dashboard/[propertyId]` | Authenticated; existing record/property checks | dashboard / legacy, client1, taru | dashboard/consolidated-dashboard | Source/period filters, score disclosures, empty evidence | Unverified record state; static owner/theme review |
| `/dashboard` | [admin] | dashboard / legacy, client1, taru | dashboard/consolidated-dashboard, dashboard/utility-kpi-rollup | Source/period filters, score disclosures, empty evidence | Runtime layout 390/1440; full record states unverified |
| `/excursions` | [admin, property_manager] | excursions / legacy | ui/card | Description, duration, price and images | Runtime layout 390/1440; full record states unverified |
| `/fleet/dispatch` | Authenticated; existing record/property checks | fleet / legacy, client1, taru | fleet/dispatch-board | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/fleet/my-rides` | Authenticated; existing record/property checks | fleet / legacy, client1, taru | fleet/requests-table | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/fleet` | Authenticated; existing record/property checks | fleet / legacy, client1, taru | fleet/requests-table | Requests, dates, passengers, reports and configuration | Runtime layout 390/1440; full record states unverified |
| `/fleet/reports/[requestId]` | Authenticated; existing record/property checks | fleet / legacy, client1, taru | fleet/structured-visit-report | Requests, dates, passengers, reports and configuration | Unverified record state; static owner/theme review |
| `/fleet/vehicles/[id]` | Authenticated; existing record/property checks | fleet / legacy, client1, taru | ui/button | Requests, dates, passengers, reports and configuration | Unverified record state; static owner/theme review |
| `/guest-profiles` | [admin, property_manager] | guest-profiles / legacy | ui/card | Guest search and existing record details | Runtime layout 390/1440; full record states unverified |
| `/issues/[issueId]` | [admin, property_manager] | tasks / legacy, client1, taru | issues/issue-detail | Search, filters, task/project editing; approval labels | Unverified record state; static owner/theme review |
| `/issues` | [admin, property_manager] | tasks / legacy, client1, taru | issues/issues-page-client | Search, filters, task/project editing; approval labels | Runtime layout 390/1440; full record states unverified |
| `/menus` | [admin, property_manager] | menus / legacy | ui/card | Categories, items and images | Runtime layout 390/1440; full record states unverified |
| `/my-roster` | Authenticated; existing record/property checks | rostering / legacy | ui/badge, ui/button, ui/card | Month/property, forecasts, assignments and CSV preview | Runtime layout 390/1440; full record states unverified |
| `/properties/[propertyId]/daily-records` | Authenticated; existing record/property checks | daily-records / legacy, taru | daily-records/daily-records-page-client | Date, readings, units, waste; tab context | Unverified record state; static owner/theme review |
| `/properties/[propertyId]/excursions` | [admin, property_manager] | excursions / legacy | admin/excursions-page-client | Description, duration, price and images | Unverified record state; static owner/theme review |
| `/properties/[propertyId]/guest-profiles` | [admin, property_manager] | guest-profiles / legacy | guest-profiles/guest-profiles-page-client | Guest search and existing record details | Unverified record state; static owner/theme review |
| `/properties/[propertyId]/menus` | [admin, property_manager] | menus / legacy | admin/menus-page-client | Categories, items and images | Unverified record state; static owner/theme review |
| `/properties/[propertyId]/utilities` | Authenticated; existing record/property checks | daily-records / legacy, taru | server wrapper / redirect | Date, readings, units, waste; tab context | Unverified record state; static owner/theme review |
| `/properties/[propertyId]/waste` | Authenticated; existing record/property checks | daily-records / legacy, taru | server wrapper / redirect | Date, readings, units, waste; tab context | Unverified record state; static owner/theme review |
| `/properties` | [admin] | core / legacy, client1, taru | admin/properties-page-client | Existing administration or account fields | Runtime layout 390/1440; full record states unverified |
| `/rostering/[cycleId]` | Authenticated; existing record/property checks | rostering / legacy | rostering/roster-preview | Month/property, forecasts, assignments and CSV preview | Unverified record state; static owner/theme review |
| `/rostering/[cycleId]/print` | Authenticated; existing record/property checks | rostering / legacy | rostering/print-button, ui/button | Month/property, forecasts, assignments and CSV preview | Unverified record state; static owner/theme review |
| `/rostering/approvals` | Authenticated; existing record/property checks | rostering / legacy | ui/badge, ui/button, ui/card | Month/property, forecasts, assignments and CSV preview | Runtime layout 390/1440; full record states unverified |
| `/rostering` | Authenticated; existing record/property checks | rostering / legacy | rostering/rostering-home | Month/property, forecasts, assignments and CSV preview | Runtime layout 390/1440; full record states unverified |
| `/rostering/setup` | Authenticated; existing record/property checks | rostering / legacy | rostering/forecast-grid, rostering/import-panel, rostering/profile-link-manager, rostering/unavailability-manager, ui/tabs | Month/property, forecasts, assignments and CSV preview | Runtime layout 390/1440; full record states unverified |
| `/scan/asset/[id]` | Authenticated; existing record/property checks | assets / legacy | assets/asset-quick-view, ui/card | Search, asset/room fields, scan actions | Unverified record state; static owner/theme review |
| `/settings` | Authenticated; existing record/property checks | settings / legacy | providers/auth-provider, ui/card, ui/badge, ui/avatar, ui/separator | Read-only profile and assignments | Runtime layout 390/1440; full record states unverified |
| `/sops/categories` | [admin] | sops / legacy | sops/sop-categories-management, sops/sops-area-tabs | Checklist, assignments and template fields | Runtime layout 390/1440; full record states unverified |
| `/sops/dashboard` | [admin, property_manager] | sops / legacy | sops/sop-dashboard-client | Checklist, assignments and template fields | Runtime layout 390/1440; full record states unverified |
| `/sops` | Authenticated; existing record/property checks | sops / legacy | sops/my-sops-client | Checklist, assignments and template fields | Runtime layout 390/1440; full record states unverified |
| `/sops/templates/[templateId]` | [admin] | sops / legacy | admin/sop-builder, admin/sop-assignments, ui/separator | Checklist, assignments and template fields | Unverified record state; static owner/theme review |
| `/sops/templates/new` | [admin] | sops / legacy | admin/sop-builder | Checklist, assignments and template fields | Runtime layout 390/1440; full record states unverified |
| `/sops/templates` | [admin] | sops / legacy | ui/button, ui/card, ui/badge, ui/separator, sops/sops-area-tabs | Checklist, assignments and template fields | Runtime layout 390/1440; full record states unverified |
| `/surveys/[submissionId]` | Authenticated; existing record/property checks | surveys / legacy, client1 | surveys/survey-form, surveys/survey-score-display, ui/badge, ui/button | Property/template, ratings, notes, draft state | Unverified record state; static owner/theme review |
| `/surveys/new` | Authenticated; existing record/property checks | surveys / legacy, client1 | surveys/new-survey-wizard | Property/template, ratings, notes, draft state | Runtime layout 390/1440; full record states unverified |
| `/surveys` | Authenticated; existing record/property checks | surveys / legacy, client1 | ui/button, ui/badge, ui/separator, ui/table, ui/card, surveys/survey-filters, surveys/surveys-area-tabs, surveys/copy-link-button, surveys/delete-survey-button | Property/template, ratings, notes, draft state | Runtime layout 390/1440; full record states unverified |
| `/surveys/s/[slug]` | Authenticated; existing record/property checks | surveys / legacy, client1 | server wrapper / redirect | Property/template, ratings, notes, draft state | Unverified record state; static owner/theme review |
| `/surveys/templates/[templateId]` | [admin] | surveys / legacy, client1 | admin/template-builder | Property/template, ratings, notes, draft state | Unverified record state; static owner/theme review |
| `/surveys/templates/new` | [admin] | surveys / legacy, client1 | admin/template-builder | Property/template, ratings, notes, draft state | Runtime layout 390/1440; full record states unverified |
| `/surveys/templates` | [admin] | surveys / legacy, client1 | ui/button, ui/card, ui/badge, ui/separator, admin/template-actions, admin/guest-link-dialog, surveys/surveys-area-tabs | Property/template, ratings, notes, draft state | Runtime layout 390/1440; full record states unverified |
| `/tasks/[projectId]` | Authenticated; existing record/property checks | tasks / legacy, client1, taru | tasks/task-workspace, tasks/workspace-types | Search, filters, task/project editing; approval labels | Unverified record state; static owner/theme review |
| `/tasks/committees` | Authenticated; existing record/property checks | tasks / legacy, client1, taru | tasks/workspace-types, tasks/task-committees-client | Search, filters, task/project editing; approval labels | Runtime layout 390/1440; full record states unverified |
| `/tasks` | Authenticated; existing record/property checks | tasks / legacy, client1, taru | tasks/task-workspace, tasks/workspace-types | Search, filters, task/project editing; approval labels | Runtime layout 390/1440; full record states unverified |
| `/tasks/projects` | Authenticated; existing record/property checks | tasks / legacy, client1, taru | tasks/projects-landing-client | Search, filters, task/project editing; approval labels | Runtime layout 390/1440; full record states unverified |
| `/tasks/routing` | Authenticated; existing record/property checks | tasks / legacy, client1, taru | tasks/workspace-types, tasks/task-routing-client | Search, filters, task/project editing; approval labels | Runtime layout 390/1440; full record states unverified |
| `/tasks/teams` | Authenticated; existing record/property checks | tasks / legacy, client1, taru | server wrapper / redirect | Search, filters, task/project editing; approval labels | Runtime layout 390/1440; full record states unverified |
| `/utilities` | Authenticated; existing record/property checks | utilities / legacy | server wrapper / redirect | Redirect/public-default boundary | Runtime layout 390/1440; full record states unverified |
| `/waste` | Authenticated; existing record/property checks | daily-records / legacy, taru | server wrapper / redirect | Date, readings, units, waste; tab context | Runtime layout 390/1440; full record states unverified |

Contrast checks: primary text on cream 10.15:1; supporting text on panel 5.82:1; field boundary on white 3.90:1. Dark primary text on panel 11.25:1; supporting text 7.48:1; field boundary 5.76:1.

## Native control and presentation exceptions

Native task controls, dashboard filters, forecast cells and distance cells receive scoped field boundaries and readable text. Single-control `Field` wrappers associate generated labels/IDs; groups of property checkboxes use fieldsets/legends and individual nested labels. Input IDs explicitly owned by RHF remain intact.

Checkboxes, radios, range controls, hidden inputs and file inputs are excluded from text-input surface rules. File/camera controls preserve their existing accepted types and upload handlers. Roster/forecast/dispatch/distance tables retain contained horizontal scrolling; their dense fields use a 36px exception. Chart ticks, badge micro-labels and printed QR/roster documents retain intentional sizing where appropriate. Photography and status/score semantic colours remain meaningful; global public tokens are untouched. Public guest surveys, menus, excursions, utility QR forms and driver manifests do not inherit the portal scope.

## Decisions and review fixes

- Generated field IDs associate repeated labels without collisions. Risk if wrong: inaccessible label/control pairs; rendered-markup tests cover unique and explicit IDs.
- Existing mobile task cards were refined instead of duplicated. Risk: overlooking an existing detail; desktop/phone layouts and existing task contracts remain covered.
- Native forms track DOM snapshots in memory; RHF forms use dirty state. Successful owner saves advance only their own baseline. Risk: custom controls outside forms need explicit integration; forecasts, rooms, assignments, imports and template switches have explicit guards.
- Local QA uses a disposable copy/database because the pre-existing dev user ID breaks UUID queries. Risk: fixture divergence; refresh the copy after source edits and review real staff/manager sessions before release.
- Shared theme and module work overlap, so local commits group foundations and module refinements. Risk: coarser commit rollback; scope and route ownership are documented here.
- Explicit Cancel handlers pass through discard confirmation. Attachment saves preserve unrelated comments. Forecast controls lock during saving. Mobile portalled navigation gets its own forest scope. Ride Selects expose human labels and error links point to the actual new-task input. These address the final independent review findings.
- A browser reproduction found roster setup tabs unmounting dirty forecasts; guarded workspace tabs now use manual activation, ask once and retain edits when cancelled. Normal in-form ride-mode tabs retain their existing editing behavior.
- Survey draft acceptance records answered questions from the submitted snapshot only; edits made while autosaving and notes excluded from the existing payload stay dirty. Timing and request payload semantics are unchanged.

## Real-user release acceptance

Run a short unassisted session with one administrator, one property manager and one staff member, including people who are uncomfortable with software. Use existing safe test records. Ask each person to:

1. Find their next action and explain the property/context shown.
2. Create or edit a task/ride/reading appropriate to their role.
3. Correct a required-field error without assistance.
4. Explain pending approval versus completed work.
5. Recognize a successful save, then cancel a dirty form safely.

Record completion without help, confusion, mistaken taps, time taken and comfort rating before/after. Success means clearer task completion and increased confidence; automated checks cannot establish that users love the system.

Still unverified: real staff/manager sessions; long historical datasets; inactive property/edit fixtures; complete survey/SOP submissions; camera-denied/OCR flows; real file storage; bulk-import and invite delivery; Oracle refresh/sync; full roster and QR print output; service-worker update prompts; 200% browser zoom with actual operating-system text settings. Validate these against isolated fixtures before production promotion. No production deployment or external writes were performed.
