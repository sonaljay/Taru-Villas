# Taru Villas Vercel release

Development branch: `main`. Client release branch: `taru-release`.
Both branches contain the same feature code. `deployment-profile.json` is the
only intentional difference: `development` on main, `taru-release` on release.
Vercel team/project: `taru-vi-llas/taru-villas`.

`next.config.ts` reads the profile and bakes the release policy into server,
middleware, and client bundles. Release pins `CLIENT_ENABLED_MODULES` to
`dashboard,tasks,fleet,daily-records`, regardless of environment overrides.
Development leaves the existing environment policy available; leave
`CLIENT_ENABLED_MODULES` unset for all modules (invite-only deployments still
require an explicit valid module list).

## Branch workflow

Use `main` for development and feature testing (or merge feature branches into
`main`). Promote changes to `taru-release` only after Sonal explicitly approves
them as final. Never automatically sync development changes into release.
Keep the release profile when resolving any profile conflict. If a fix starts on release, merge it back into main and
restore the development profile before committing. Do not squash or rebase the
shared reconciliation history. Verify the profile on both branches before push.
Never remove a feature to hide it from the client; update the release policy.

The September 2026 reconciliation preserves both original histories with a merge.
The original tips (`9954175` and `795c81f`) remain in the shared history. It
combines structured fleet visit reports from main with consolidated
Google/Tripadvisor dashboards from release. During the September 25 cleanup,
merged branch labels were removed; unmerged email-auth and OTA-review work was
preserved on GitHub feature branches. Uncommitted work was retained locally.

Both `0032_google_review_analyses.sql` and
`0032_visit_report_categories_and_observations.sql` are retained under their
original names, along with `0033_tripadvisor_review_source.sql`. The historical
migration prefixes overlap; do not assume a numeric prefix uniquely identifies
a migration. Check the target database before applying any missing migration.
This reconciliation does not run database migrations.

Enabled products:

- Dashboard (existing dashboard reporting)
- Task Manager
- Fleet Management, including dispatch, vehicles, drivers, distances, driver
  links, and fleet APIs, subject to existing role permissions
- Daily Records: water, electricity, and wastage, including their backing APIs

Users and Property Settings remain available to admins as core infrastructure.
Other product pages and APIs return 404, including Surveys, SOPs, Rostering,
Assets, Menus, Excursions, Guest Profiles, and standalone Utilities pages.
The sign-in provisioning endpoint remains available under its existing checks.
Non-admin users land on Tasks instead of the disabled Surveys module.

Preview uses the existing Supabase Auth/database. A separate Git branch and
Vercel release do not isolate database records or user accounts. This release
does not change shared Supabase settings or migrate data.

## Deployment

The release branch was renamed from `codex/taru-release` to `taru-release`.
Check external deployment branch selectors and branch-scoped environment
settings for the new name before the next deployment. GitHub branch renaming
does not verify those external settings.

From this branch's checkout, link to the existing new-team project and run
`vercel deploy --yes`. Keep this as Preview until production is explicitly
requested. Ensure the deployment source is this branch rather than `main`.

Required Preview variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_URL` (or `DATABASE_URL`), and
`SUPABASE_SERVICE_ROLE_KEY`. Parse dotenv values before importing; copying raw
quoted assignments with awk preserves literal quotes and breaks Supabase URLs.

Acceptance: login renders, signed-in admin navigation shows approved products,
Daily Records APIs pass the module gate, disabled pages/APIs return 404, and
non-admin redirects avoid Surveys. Keep existing authorization guards in force.
