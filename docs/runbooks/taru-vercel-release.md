# Taru Villas Vercel release

Development branch: `main`. Client release branch: `codex/taru-release`.
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

Develop features on main (or merge feature branches into main), then merge main
into release when ready for the client. Keep the release profile when resolving
any profile conflict. If a fix starts on release, merge it back into main and
restore the development profile before committing. Do not squash or rebase the
shared reconciliation history. Verify the profile on both branches before push.
Never remove a feature to hide it from the client; update the release policy.

The September 2026 reconciliation preserves both original histories with a merge.
Recovery refs: `codex/backup-main-20260913` (`9954175`) and
`codex/backup-taru-release-20260913` (`795c81f`). It combines structured fleet visit
reports from main with consolidated Google/Tripadvisor dashboards from release.
Existing feature branches and untracked files are retained.

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
