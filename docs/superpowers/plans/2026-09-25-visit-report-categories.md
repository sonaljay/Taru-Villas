# Visit Report Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the four approved category-specific reports, question photos,
optional task links, accurate scoring, historical snapshots and acknowledgement.
**Architecture:** Versioned template data and report snapshots; transactional
structured response service; private attachment endpoints; shared React form.
**Tech Stack:** Next.js, Drizzle/PostgreSQL, Zod, Supabase Storage, Vitest.
**Spec:** docs/superpowers/specs/2026-09-25-visit-report-categories.md

## Global Constraints
Preserve legacy reports and 48h owner editing window. No new dependencies.
No shared DB or release deployment this iteration without explicit authorization.
Photos 0–5 per answer, 10MB JPEG/PNG/WebP. All mutations attributed and timestamped.

## Review Focus
- Concurrent uploads/saves/removals must not exceed photo limits or duplicate tasks.
- Expiry, cancellation, role changes and cross-org/report identifiers must fail closed.
- Template edits preserve historical snapshots; stale revisions cannot overwrite.
- Repeat locations, incomplete drafts and N/A must survive save/reload correctly.
- Task creation after submission, retrying submissions and old report APIs cannot
  bypass task approval, archived status, report ownership, or deadline gates.

### Task 1: Templates, schemas, migration
- [x] Add failing tests for four source counts, scoring, snapshot validation and duplicate IDs.
- [x] Implement seed data, template/response validation, pure scoring and edit guards.
- [x] Add additive migration 0035 and Drizzle types for snapshots, answers, photos, events.
- [x] Run pure tests; expect source counts and N/A cases pass. Commit.

### Task 2: Transactional report service
- [x] Add failing disposable DB tests for legacy preservation, template start,
  owner/deadline/cancel gates, stale save, snapshot history and task idempotency.
- [x] Implement scoped reads, start/save/submit, section repetition and task effects.
- [x] Add template admin version publishing and acknowledgement service after answer.
- [x] Guard legacy mutation endpoints and use scoped task options. Run DB tests. Commit.

### Task 3: Private photos
- [x] Add failing DB tests for 5-photo reservation limit, wrong report and expiry.
- [x] Implement upload reservation, signature validation, ready-state finalization,
  signed read and tombstone removal with durable orphan cleanup.
- [x] Run relevant tests and type checks. Commit.

### Task 4: Report and admin UI
- [x] Implement category selector, shared sections, repeated locations, answer/photo/task
  controls, scorecard totals, draft/save/submit, read-only and acknowledgement states.
- [x] Add admin version editor preserving existing taxonomy administration.
- [x] Browser-test local fixtures and desktop/mobile layouts. Fix observed defects.

### Task 5: Verification and review
- [x] Run unit + disposable integration + lint + TypeScript + build.
- [x] Obtain one fresh whole-branch review; fix important findings with regressions.
- [x] Document rollout/prerequisites; prepare a draft PR for main under the development
  workflow. Keep taru-release unchanged pending specific release authorization.

Execution note: feature committed as one reviewed change; no main merge because
shared migration and coordinated deployment must precede activation.
