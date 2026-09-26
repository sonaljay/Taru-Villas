# HQ HR visit report

Approved: fifth category from HR Visit Report V5; user selected dedicated HQ HR committee plus admins for confidential access.

## Design
- Seed 17 inspection prompts in four sections, 5 property scores, five repeatable employee evaluation criteria (1–5; employee name, department, feedback; total /25), and optional confidential conversations (subject/location, feedback and HR assessment).
- HR committee/admin can start HR reports. Shared HR content readable by active HR members/admin and property managers, excluding Fleet/booker-only access. Removed committee membership revokes confidential access immediately.
- Confidential answers use separate read/save endpoint and private revision, remain in answer storage with immutable template kinds, share private photo storage with audience-aware checks. No confidential task creation/linking. Shared follow-up tasks never copy employee names or confidential notes automatically.
- Shared and private saves/audit events are separated. Confidential changes do not alter shared acknowledgement revision. Every photo access rechecks audience. Legacy GET rejects HR reports.
- Admins manage HQ HR membership using existing committee controls; stable is_hr marker survives rename and cannot be archived. Seed empty committee; do not assign users without instruction.
- Preserve existing four category snapshots/behaviour, strict 48h owner editing window, optional photos, and source questions. Source labour-rule prose is guidance, not a new payroll or legal validation engine.

## Execution
1. Failing tests for seed counts, evaluation groups, private/shared separation. Add migration0036, seed and model support.
2. Implement committee gate, scoped shared service, private endpoint, audience-aware photo and audit. Test nonmembers/PM/Fleet/booker, membership revocation, photo reads, stale private saves, no private notification resets.
3. Add shared employee evaluation UI and isolated private feedback UI, admin explanatory membership controls. Browser-check mobile, private omission, and shared save.
4. Run full tests/types/lint/build and fresh final reviewer. Commit feature for user review; do not infer new release approval from prior category rollout.

## Verification
- Full unit suite: 339 passed; database-dependent suites skipped in this command and run separately.
- Disposable task-workflow baseline rebuilt successfully; report suites applied migrations 0035 and 0036 from baseline and passed.
- Final structured-report suite: 22 passed, including confidential read/photo denial, membership revocation, stale revisions, expired edits, acknowledgement preservation and committee-name collisions.
- TypeScript and production build passed. ESLint: zero errors, 53 existing warnings.
- Browser QA: HR shared form, employee score totals, separate private save and 390px mobile layout verified. Temporary local authentication fixture restored afterward. Physical camera capture not tested.
- Independent review found committee-name adoption risk; fixed migration and lazy initialization to provision a new empty group on collisions. Reviewer confirmed no remaining product findings; regression corrected to account for default Operations committee.
- Migration has only been applied to the disposable local database. No live memberships, database or deployment changed for this feature.
