# Portal mobile polish — 3 October 2026

This pass refines the approved cream/forest design in response to cramped mobile layouts and dropdown arrows touching the field edge. It was verified on `codex/mobile-ui-polish` before release promotion. Sonal approved committing and deploying this pass on 3 October 2026.

## Changes

- Native dropdowns reserve 44px for the chevron, inset 14px from the edge. Radix triggers reserve a separate icon gutter. Long values truncate inside the control; popup items can wrap.
- One main landmark replaces the previous nested main structure. Mobile header/page padding and safe-area spacing apply to their intended surfaces.
- Buttons and editing controls provide at least 44px height; text fields remain 16px on phones. Dense spreadsheet controls use 44px on phones while retaining their desktop sizing.
- Phone dialogs stay inside the viewport with internal scrolling and a clear close-button area. Task fields, dates, project/dispatch forms and rate tiers stack on smaller screens.
- Save-protection fieldsets no longer swallow form spacing. Focus rings have space before the next label. Field values use regular weight, while labels retain emphasis.
- Fleet requests, meter readings and waste records use cards through tablet widths; full tables start at 1280px. Existing actions and permissions are reused. Task filters and Daily Records tabs fit narrow screens.

## Verification

- Browser checks used the in-app Chromium browser against a disposable local app/database with sample records. Production data was not edited. The preview uses its own valid fixture user and disables development service-worker registration; these preview-only changes are absent from application source.
- Dashboard, Tasks and Fleet were checked at 320, 390, 430, 768, 1024 and 1440px. Observed controls have 16px text, at least 44px height, and inset arrows. The measured pages have one main landmark and no document overflow.
- Fifteen core/admin routes were checked at 390px: dashboard, Fleet requests/dispatch/My Rides, task projects/committees/routing, Daily Records, users, properties, Fleet vehicles/drivers/distances/report categories and settings.
- Populated task detail, ride, water readings and waste states were checked. The 320×568 task and waste dialogs fit with 12px edge clearance and internal scrolling; task fields measure 262px wide. The task and waste date-to-next-label gaps measure 20px.
- At 1024px Fleet previously rendered a 1194px table inside a 718px container. The revised card layout is visible and the table is hidden at that width. The 320px navigation drawer measures 272px and uses the forest palette. Fleet dropdown popup stays within the 390px viewport.
- `npm run test -- --exclude '**/*.integration.test.ts'`: 53 suites / 356 tests passed. Database-writing integration suites were excluded.
- `npm run build`, `npx tsc --noEmit`, ESLint on changed TS/TSX/CJS files, and `git diff --check` passed. The build requires network access for the existing configured Geist fonts.
- Independent code review found no actionable regressions in responsive spans, disabled/save guards, permission checks, or card/table actions.
- The existing `scripts/check-portal-ui.cjs` harness now asserts arrow gutters, control size, one main landmark, header width, small-phone task form spacing/field widths, and Fleet card/table breakpoints. The updated CLI harness was not executed in this pass; current browser evidence came from in-app browser checks.

## Remaining acceptance

Browser viewport checks are not physical-device certification. Real iOS Safari/Android keyboards, large operating-system text settings, real staff/manager sessions, and long historical datasets still need device/role acceptance. Earlier UI acceptance and public-page boundaries are recorded in `portal-ui-acceptance.md`. No auth policy, API contract, schema or deployment profile changes are included.
