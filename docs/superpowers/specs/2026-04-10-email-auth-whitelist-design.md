# Email Auth + Whitelist Design

## Goal

Replace Google OAuth (requires Supabase Pro) with email/password auth (free tier) plus an admin-managed email whitelist. Temporary measure for MVP — designed for easy switch back to Google OAuth at go-live.

## Database

### New table: `allowed_emails`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, defaultRandom |
| orgId | uuid | FK to organizations |
| email | varchar(255) | unique, stored lowercase |
| addedBy | uuid | FK to profiles, nullable |
| createdAt | timestamp | defaultNow |

## Auth Flow

### Login page (`/login`)

- Email + password form with Sign In / Sign Up toggle
- **Sign In:** `supabase.auth.signInWithPassword()` -> redirect to `/dashboard`
- **Sign Up:** POST `/api/auth/check-whitelist` -> if allowed, `supabase.auth.signUp()` -> POST `/api/auth/provision` (creates profile) -> redirect to `/dashboard`
- No email confirmation (disabled in Supabase settings)

### Profile provisioning (`POST /api/auth/provision`)

Same logic as current `/callback` route:
- Check if profile exists for the authenticated user
- If not, check whitelist server-side (double validation)
- Create profile (first user = admin, rest = staff)
- Assign all properties if admin

### Callback route (`/callback`)

Kept intact for future Google OAuth switch-back. Not used by email/password flow.

## Supabase Configuration (Manual)

1. Auth -> Providers: disable Google OAuth
2. Auth -> Settings -> Email: turn OFF email confirmations
3. Project Settings -> Billing: downgrade to free tier

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/auth/check-whitelist` | POST | None (public) | Check if email is whitelisted before sign-up |
| `/api/auth/provision` | POST | Session required | Create profile after sign-up |
| `/api/admin/allowed-emails` | GET, POST | Admin only | List + add whitelisted emails |
| `/api/admin/allowed-emails/[id]` | DELETE | Admin only | Remove a whitelisted email |

## Admin UI

New page at `/admin/allowed-emails`:
- Table: email, added by, date added
- Add Email button -> dialog with email input
- Delete button per row with AlertDialog confirmation
- Sidebar item: "Allowed Emails" with ShieldCheck icon

## Files Modified

- `src/lib/db/schema.ts` — add `allowedEmails` table + relations
- `src/app/(auth)/login/page.tsx` — replace Google button with email/password form
- `src/components/layout/app-sidebar.tsx` — add Allowed Emails nav item
- `src/components/layout/header.tsx` — add breadcrumb segment label

## Files Created

- `drizzle/XXXX_add_allowed_emails.sql` — migration
- `src/lib/db/queries/allowed-emails.ts` — CRUD queries
- `src/app/api/auth/check-whitelist/route.ts` — public whitelist check
- `src/app/api/auth/provision/route.ts` — profile provisioning
- `src/app/api/admin/allowed-emails/route.ts` — GET + POST
- `src/app/api/admin/allowed-emails/[id]/route.ts` — DELETE
- `src/app/(portal)/admin/allowed-emails/page.tsx` — server page
- `src/components/admin/allowed-emails-page-client.tsx` — client component

## Unchanged

- Middleware (`src/middleware.ts`) — still checks Supabase session
- Auth guards (`src/lib/auth/guards.ts`) — still reads Supabase session
- Callback route (`/callback`) — preserved for future Google switch-back
- Profile schema, roles, property assignments — all unchanged

## Switch Back to Google

1. Re-enable Google OAuth in Supabase dashboard
2. Swap login page back to Google button
3. `allowed_emails` table stays dormant
