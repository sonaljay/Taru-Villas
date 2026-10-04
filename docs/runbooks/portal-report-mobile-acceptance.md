# Visit report mobile corrections — 4 October 2026

This pass follows the real iPhone Safari screenshot showing overflowing date/time fields on the HR visit report. It preserves the approved cream/forest design and native form pickers. Changes were reviewed on `codex/mobile-report-responsiveness`, based on `b105cae`. Sonal approved committing, pushing and promoting this pass to production on 4 October 2026.

## Corrections

- The screenshot matches [WebKit issue 301648](https://bugs.webkit.org/show_bug.cgi?id=301648): padded temporal inputs can exceed their 100% width on iOS. Portal date/time/month/week/datetime controls now explicitly shrink within their containers. The iOS-only rule removes horizontal host padding and places the inset on the native value pseudo-element. Desktop picker styling is retained.
- Structured reports use the portal's existing page padding. Field labels form explicit, shrinkable columns with consistent gaps; nested follow-up fields can also shrink. Normal fields remain at least 46px tall and use 16px text. Minimum heights grow with enlarged field text.
- Phone save status occupies its own row above equal-width actions. Buttons can wrap, horizontal/bottom safe areas are respected, and desktop actions clear the sidebar. A ResizeObserver reserves the toolbar's actual height at the end of the report; field scroll margins include that clearance.
- Report navigation had duplicate React keys because two breadcrumb entries link to `/fleet`. Keys now include the trail position, preserving their destinations.
- Save, submit, upload, authorization and report business rules are unchanged.

## Evidence

Browser QA used a disposable localhost app with synthetic reports, no database connection, and writes returning HTTP 409. Fixture routes, auth bypass fixture changes, service-worker disabling, enlarged-text overrides and development-indicator settings are absent from application source.

- The initial 375px regression failed: the first card began at 32px instead of the available 16px inset; status and actions occupied the same row. The corrected card starts at 16px, with two 165.5px-wide buttons below status.
- Read-only geometry assertions passed for all 78 visible HR controls at 320, 375, 390, 440, 568×320 landscape, 768, 1024 and 1440px. They check field containment within its own label, minimum touch size, text clipping, viewport overflow, action width and end-of-report clearance.
- Facilities, security, submitted (one save action), read-only (disabled fields/no toolbar), and HR confidential-feedback variants passed at 320px. The loaded confidential variant includes 81 controls. Geometry checks scope toolbar status separately from confidential status and measure the final report history.
- Expanded follow-up fields passed at 320px. Native keyboard time entry and ordinary text edits remained after a blocked save, with an error message and unsaved status; explicit reload restored saved fixture values.
- A preview-only 200% field/button text stress test failed vertical clipping before font-based minimum heights. After correction it passed at 320px; the toolbar grew to 189px and the final history retained 237px clearance.
- macOS Safari responsive mode was visually checked at its 440×956 iPhone Pro Max preset. Native date/time controls fit the card. This is desktop WebKit, not an iOS simulator.
- `npm run test` passed 53 suites / 356 tests, with 11 database integration suites / 35 tests skipped through their opt-in flags. No database integration writes were run. Production build, TypeScript, changed-file ESLint and whitespace checks passed. Build needed network access for the existing Google fonts. TypeScript was verified after build regenerated `.next/types`.
- Independent review found two geometry-harness issues (confidential status/history selection and safe-area width thresholds), both corrected. Final review found no actionable runtime issues.

`scripts/portal-report-layout.mjs` contains the geometry checks executed through the in-app browser. The existing CLI harness accepts `PORTAL_UI_REPORT_ID` for a local report fixture and `PORTAL_UI_REPORT_ONLY=1` to run only the report checks. Its CLI was not executed; current evidence comes from the in-app browser.

## Device acceptance

Real iPhone Safari remains unverified in this pass. No iOS simulator is installed. Native keyboard behavior, actual notch/home-indicator safe areas and operating-system text settings require physical-device acceptance before calling this device-certified. The iOS workaround is based on the matching WebKit defect; desktop Safari and Chromium screenshots cannot certify its effect on the user's phone.
