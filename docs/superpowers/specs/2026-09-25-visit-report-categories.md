# Category-specific Fleet visit reports

Sonal approved implementing all four reviewed Google Docs report categories on
2026-09-25. This implements the approved analysis without changing the 48-hour
editing window. Development work is authorized; promotion of this new feature to
release and shared database migration require a later explicit release request.

## Requirements
- Stylist & Interior Design: 5 sections / 14 inspection prompts / 5 scored items.
- Landscaping & Grounds: 5 sections / 10 inspection prompts / 6 scored items.
- Security & Safety: 4 sections / 11 inspection prompts / 5 scored items.
- Facilities & Maintenance: 7 sections / 24 inspection prompts / 6 scored items.
- Preserve source inspection guidance as question help text. Visit subtype differs
  from report category. Keep visit details, summary, inspections, scorecard,
  task follow-up, and sign-off visible as separate report sections.
- Every inspection and scorecard question supports an answer/comment, 0–5 private
  photos uploaded or captured, and no task / existing task / new task.
- New tasks use existing Task Manager defaults, optional project, current actor,
  property, assignment validation, Operations ownership and audit rules.
- Category templates are versioned. A report snapshots its selected template;
  changes to templates cannot rewrite historical questions or answers.
- Repeated inspection locations can be added by section without duplicating the
  report-level scorecard. Each answer retains its location and stable identity.
- N/A scored answers do not contribute to numerator or denominator. All N/A has
  no numeric average, not zero. Distinguish unanswered from N/A.
- Owner can draft before completion; submit after completion; edit submitted
  answers until strictly before completion +48h. Cancelled rides cannot edit.
- Existing reports remain readable and editable using the legacy form unless an
  unsubmitted report is explicitly switched to a template. Never reinterpret or
  delete historical report content.
- Each active property manager is assigned an in-app notification when the report
  is submitted, and must acknowledge they have read it (not approval). Record
  recipient/version/time. A revised submitted report requires acknowledgement
  of the new content. Acknowledgement remains available after the edit deadline.
  No email until separately configured.
- Org boundaries and existing report ownership enforced on server. Existing-task
  options and validation respect Task Manager visibility; no cross-report photo
  access. Photos: supported JPEG/PNG/WebP signatures, maximum 10 MB each.
- Report changes and acknowledgement are timestamped/attributed; optimistic
  revision checks prevent stale tabs overwriting answers or duplicating tasks.

## Design
Add versioned org templates, immutable per-report JSON template snapshot and
structured response tables beside legacy fields. New API routes serve the new
form; legacy APIs reject writes to template reports. Template schema supports
ordered sections/questions and source guidance; seeded four templates are data,
not four independently coded forms. Admin template editing publishes a new
version while existing report snapshots remain unchanged. Report photos reuse
private task storage with independent metadata and existing durable cleanup.
