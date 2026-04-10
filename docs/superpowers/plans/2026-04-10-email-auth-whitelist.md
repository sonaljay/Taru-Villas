# Email Auth + Whitelist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google OAuth with email/password auth + admin-managed email whitelist to enable Supabase free tier during MVP.

**Architecture:** New `allowed_emails` table stores whitelisted emails. Login page swaps from Google OAuth button to email/password form with sign-in/sign-up toggle. Sign-up checks whitelist via API before creating Supabase auth user. Profile auto-provisioning moves from `/callback` to a dedicated `/api/auth/provision` route. Admin manages whitelist at `/admin/allowed-emails`.

**Tech Stack:** Next.js 16 App Router, Supabase Auth (email/password), Drizzle ORM, shadcn/ui, Zod v4, Sonner toasts

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/db/schema.ts` | Add `allowedEmails` table + relations + types |
| Create | `src/lib/db/queries/allowed-emails.ts` | CRUD queries for allowed_emails |
| Create | `src/app/api/auth/check-whitelist/route.ts` | Public: check if email is whitelisted |
| Create | `src/app/api/auth/provision/route.ts` | Authenticated: create profile after sign-up |
| Create | `src/app/api/admin/allowed-emails/route.ts` | Admin: GET list + POST add email |
| Create | `src/app/api/admin/allowed-emails/[id]/route.ts` | Admin: DELETE email |
| Modify | `src/app/(auth)/login/page.tsx` | Replace Google OAuth with email/password form |
| Create | `src/app/(portal)/admin/allowed-emails/page.tsx` | Admin server page |
| Create | `src/components/admin/allowed-emails-page-client.tsx` | Admin client component |
| Modify | `src/components/layout/app-sidebar.tsx` | Add "Allowed Emails" nav item |
| Modify | `src/components/layout/header.tsx` | Add breadcrumb segment label |

---

### Task 1: Database Schema — `allowedEmails` table

**Files:**
- Modify: `src/lib/db/schema.ts` (append after SOP tables, before type exports ~line 789)

- [ ] **Step 1: Add the `allowedEmails` table and relations to schema.ts**

Add this block before the `// Type exports` section (before line 789):

```typescript
// ---------------------------------------------------------------------------
// Allowed Emails (whitelist for email/password auth)
// ---------------------------------------------------------------------------
export const allowedEmails = pgTable('allowed_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  addedBy: uuid('added_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const allowedEmailsRelations = relations(allowedEmails, ({ one }) => ({
  organization: one(organizations, { fields: [allowedEmails.orgId], references: [organizations.id] }),
  addedByProfile: one(profiles, { fields: [allowedEmails.addedBy], references: [profiles.id] }),
}))
```

Then add these type exports at the bottom of the file (after the existing type exports):

```typescript
export type AllowedEmail = typeof allowedEmails.$inferSelect
export type NewAllowedEmail = typeof allowedEmails.$inferInsert
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: A new migration SQL file in `drizzle/` directory

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add allowed_emails table for email whitelist auth"
```

---

### Task 2: Queries — `allowed-emails.ts`

**Files:**
- Create: `src/lib/db/queries/allowed-emails.ts`

- [ ] **Step 1: Create the queries file**

```typescript
import { eq } from 'drizzle-orm'
import { db } from '..'
import { allowedEmails, profiles } from '../schema'

/**
 * Check if an email is in the allowed list.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const results = await db
    .select({ id: allowedEmails.id })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, email.toLowerCase()))
    .limit(1)

  return results.length > 0
}

/**
 * Get all allowed emails for an organization, with the name of who added them.
 */
export async function getAllowedEmails(orgId: string) {
  const emails = await db
    .select()
    .from(allowedEmails)
    .where(eq(allowedEmails.orgId, orgId))
    .orderBy(allowedEmails.email)

  const addedByIds = emails.map((e) => e.addedBy).filter(Boolean) as string[]

  let profileMap: Record<string, string> = {}
  if (addedByIds.length > 0) {
    const addedByProfiles = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)

    profileMap = Object.fromEntries(
      addedByProfiles.map((p) => [p.id, p.fullName])
    )
  }

  return emails.map((e) => ({
    ...e,
    addedByName: e.addedBy ? profileMap[e.addedBy] ?? null : null,
  }))
}

/**
 * Add an email to the allowed list.
 */
export async function addAllowedEmail(data: {
  orgId: string
  email: string
  addedBy: string
}) {
  const [inserted] = await db
    .insert(allowedEmails)
    .values({
      orgId: data.orgId,
      email: data.email.toLowerCase(),
      addedBy: data.addedBy,
    })
    .returning()

  return inserted
}

/**
 * Remove an email from the allowed list.
 */
export async function removeAllowedEmail(id: string) {
  const [deleted] = await db
    .delete(allowedEmails)
    .where(eq(allowedEmails.id, id))
    .returning()

  return deleted
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/allowed-emails.ts
git commit -m "feat: add allowed_emails query functions"
```

---

### Task 3: Auth API Routes — check-whitelist + provision

**Files:**
- Create: `src/app/api/auth/check-whitelist/route.ts`
- Create: `src/app/api/auth/provision/route.ts`

- [ ] **Step 1: Create the check-whitelist route**

This is a public route — no auth required. It checks if an email is in the whitelist before sign-up.

```typescript
// src/app/api/auth/check-whitelist/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isEmailAllowed } from '@/lib/db/queries/allowed-emails'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid email', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const allowed = await isEmailAllowed(parsed.data.email)
    return NextResponse.json({ allowed })
  } catch (error) {
    console.error('POST /api/auth/check-whitelist error:', error)
    return NextResponse.json(
      { error: 'Failed to check whitelist' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Create the provision route**

This route requires an authenticated Supabase session. It creates a profile for the signed-up user, mirroring the logic from `/callback`.

```typescript
// src/app/api/auth/provision/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isEmailAllowed } from '@/lib/db/queries/allowed-emails'
import { db } from '@/lib/db'
import { profiles, organizations, properties, propertyAssignments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if profile already exists
    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1)

    if (existing[0]) {
      return NextResponse.json({ provisioned: true, existing: true })
    }

    // Double-check whitelist server-side
    const allowed = await isEmailAllowed(user.email ?? '')
    if (!allowed) {
      return NextResponse.json(
        { error: 'Email not whitelisted' },
        { status: 403 }
      )
    }

    // Check if this is the first user (→ admin)
    const allProfiles = await db.select({ id: profiles.id }).from(profiles).limit(1)
    const isFirstUser = allProfiles.length === 0

    // Get the organization
    const orgs = await db.select().from(organizations).limit(1)
    const orgId = orgs[0]?.id

    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 500 }
      )
    }

    // Create the profile
    await db.insert(profiles).values({
      id: user.id,
      orgId,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
      avatarUrl: user.user_metadata?.avatar_url ?? null,
      role: isFirstUser ? 'admin' : 'staff',
      isActive: true,
    })

    // If admin, assign all properties
    if (isFirstUser) {
      const allProperties = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.orgId, orgId))

      if (allProperties.length > 0) {
        await db.insert(propertyAssignments).values(
          allProperties.map((p) => ({
            userId: user.id,
            propertyId: p.id,
          }))
        )
      }
    }

    return NextResponse.json({ provisioned: true, existing: false })
  } catch (error) {
    console.error('POST /api/auth/provision error:', error)
    return NextResponse.json(
      { error: 'Failed to provision profile' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Add `/api/auth/` to public routes in middleware**

In `src/middleware.ts`, the `isPublicRoute` check already includes `request.nextUrl.pathname.startsWith('/api/auth')`. The check-whitelist route is under `/api/auth/`, so it's already covered. The provision route needs a session, but the middleware only redirects browser requests (not API calls that return JSON), so this is fine.

Verify: re-read `src/middleware.ts` and confirm `/api/auth` is in `isPublicRoute`. If not, add it.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/check-whitelist/route.ts src/app/api/auth/provision/route.ts
git commit -m "feat: add check-whitelist and provision API routes for email auth"
```

---

### Task 4: Login Page — Replace Google OAuth with Email/Password

**Files:**
- Modify: `src/app/(auth)/login/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the login page**

Replace the entire contents of `src/app/(auth)/login/page.tsx` with:

```typescript
'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  auth_failed: 'Authentication failed. Please try again.',
  no_profile: 'No account found. Please contact your administrator to get access.',
  not_whitelisted: 'This email is not authorized. Contact your administrator for access.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const error = searchParams.get('error')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFormError(null)

    const supabase = createClient()

    try {
      if (isSignUp) {
        // Check whitelist before sign-up
        const checkRes = await fetch('/api/auth/check-whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase() }),
        })
        const checkData = await checkRes.json()

        if (!checkData.allowed) {
          setFormError('This email is not authorized. Contact your administrator for access.')
          setLoading(false)
          return
        }

        // Sign up with Supabase
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
            },
          },
        })

        if (signUpError) {
          setFormError(signUpError.message)
          setLoading(false)
          return
        }

        // Provision the profile
        const provisionRes = await fetch('/api/auth/provision', {
          method: 'POST',
        })

        if (!provisionRes.ok) {
          const body = await provisionRes.json().catch(() => ({}))
          setFormError(body.error ?? 'Failed to set up your account.')
          setLoading(false)
          return
        }

        router.push('/dashboard')
      } else {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          setFormError(signInError.message)
          setLoading(false)
          return
        }

        router.push('/dashboard')
      }
    } catch {
      setFormError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const displayError = formError || (error ? (ERROR_MESSAGES[error] ?? 'An unexpected error occurred.') : null)

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-4">
        <img
          src="/TVPL.png"
          alt="Taru Villas logo"
          className="mx-auto size-16"
        />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Taru Villas</h1>
          <p className="text-muted-foreground">Management Portal</p>
        </div>
      </div>

      {displayError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@taruvillas.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading
            ? (isSignUp ? 'Creating account...' : 'Signing in...')
            : (isSignUp ? 'Create Account' : 'Sign In')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setFormError(null) }}
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setFormError(null) }}
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign up
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat: replace Google OAuth login with email/password form"
```

---

### Task 5: Admin API Routes — Allowed Emails CRUD

**Files:**
- Create: `src/app/api/admin/allowed-emails/route.ts`
- Create: `src/app/api/admin/allowed-emails/[id]/route.ts`

- [ ] **Step 1: Create the list + add route**

```typescript
// src/app/api/admin/allowed-emails/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  getAllowedEmails,
  addAllowedEmail,
} from '@/lib/db/queries/allowed-emails'

const addEmailSchema = z.object({
  email: z.string().email(),
})

// GET /api/admin/allowed-emails — list all whitelisted emails
export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const emails = await getAllowedEmails(profile.orgId)
    return NextResponse.json(emails)
  } catch (error) {
    console.error('GET /api/admin/allowed-emails error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch allowed emails' },
      { status: 500 }
    )
  }
}

// POST /api/admin/allowed-emails — add an email to the whitelist
export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = addEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const email = await addAllowedEmail({
      orgId: profile.orgId,
      email: parsed.data.email,
      addedBy: profile.id,
    })

    return NextResponse.json(email, { status: 201 })
  } catch (error: unknown) {
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'This email is already in the whitelist' },
        { status: 409 }
      )
    }
    console.error('POST /api/admin/allowed-emails error:', error)
    return NextResponse.json(
      { error: 'Failed to add email' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Create the delete route**

```typescript
// src/app/api/admin/allowed-emails/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { removeAllowedEmail } from '@/lib/db/queries/allowed-emails'

type RouteContext = { params: Promise<{ id: string }> }

// DELETE /api/admin/allowed-emails/[id] — remove an email from whitelist
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params

    const deleted = await removeAllowedEmail(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/admin/allowed-emails/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to remove email' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/allowed-emails/
git commit -m "feat: add admin API routes for allowed emails CRUD"
```

---

### Task 6: Admin UI — Allowed Emails Page

**Files:**
- Create: `src/app/(portal)/admin/allowed-emails/page.tsx`
- Create: `src/components/admin/allowed-emails-page-client.tsx`

- [ ] **Step 1: Create the server page**

```typescript
// src/app/(portal)/admin/allowed-emails/page.tsx
import { requireRole } from '@/lib/auth/guards'
import { getAllowedEmails } from '@/lib/db/queries/allowed-emails'
import { AllowedEmailsPageClient } from '@/components/admin/allowed-emails-page-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Allowed Emails | Taru Villas',
}

export default async function AllowedEmailsPage() {
  const profile = await requireRole(['admin'])
  if (!profile) return null

  const emails = await getAllowedEmails(profile.orgId)

  return <AllowedEmailsPageClient emails={emails} />
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/components/admin/allowed-emails-page-client.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Plus, Trash2, Search, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface AllowedEmailEntry {
  id: string
  email: string
  addedBy: string | null
  addedByName: string | null
  createdAt: string
}

interface AllowedEmailsPageClientProps {
  emails: AllowedEmailEntry[]
}

export function AllowedEmailsPageClient({ emails }: AllowedEmailsPageClientProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState<AllowedEmailEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filtered = emails.filter((e) =>
    e.email.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setIsAdding(true)
    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to add email')
      }

      toast.success('Email added to whitelist')
      setNewEmail('')
      setShowAddDialog(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add email')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete() {
    if (!deleteEmail) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/allowed-emails/${deleteEmail.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to remove email')
      }

      toast.success('Email removed from whitelist')
      setDeleteEmail(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Allowed Emails</h1>
          <p className="text-sm text-muted-foreground">
            Manage which email addresses can sign up for the platform.
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="size-4" />
          Add Email
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search emails..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Added By</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.addedByName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteEmail(entry)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Mail className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No allowed emails yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add email addresses to allow users to sign up.
          </p>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" />
            Add First Email
          </Button>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Allowed Email</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-email">Email Address</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="user@taruvillas.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isAdding}>
                {isAdding ? 'Adding...' : 'Add Email'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEmail} onOpenChange={(o) => !o && setDeleteEmail(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteEmail?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This person will no longer be able to sign up. Existing accounts are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(portal)/admin/allowed-emails/page.tsx src/components/admin/allowed-emails-page-client.tsx
git commit -m "feat: add admin UI for managing allowed emails whitelist"
```

---

### Task 7: Navigation — Sidebar + Breadcrumbs

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx` (line 75-82, adminNavItems)
- Modify: `src/components/layout/header.tsx` (line 16-30, segmentLabels)

- [ ] **Step 1: Add sidebar nav item**

In `src/components/layout/app-sidebar.tsx`:

Add `ShieldCheck` to the lucide-react import (line 17-18 area):
```typescript
// Add ShieldCheck to the existing import
import {
  LayoutDashboard,
  ClipboardCheck,
  Settings,
  Building2,
  FileText,
  Users,
  LogOut,
  ChevronsUpDown,
  ListTodo,
  Compass,
  UtensilsCrossed,
  ListChecks,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react'
```

Add the nav item to `adminNavItems` (after "Manage Users" on line 81):
```typescript
const adminNavItems: NavItem[] = [
  { title: 'Manage Properties', href: '/admin/properties', icon: Building2 },
  { title: 'Submitted Surveys', href: '/admin/surveys', icon: ClipboardCheck },
  { title: 'Manage Tasks', href: '/admin/tasks', icon: ListTodo },
  { title: 'Manage Templates', href: '/admin/templates', icon: FileText },
  { title: 'Manage SOPs', href: '/admin/sops', icon: ClipboardList },
  { title: 'Manage Users', href: '/admin/users', icon: Users },
  { title: 'Allowed Emails', href: '/admin/allowed-emails', icon: ShieldCheck },
]
```

- [ ] **Step 2: Add breadcrumb segment label**

In `src/components/layout/header.tsx`, add to `segmentLabels` (line 16-30):
```typescript
'allowed-emails': 'Allowed Emails',
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/header.tsx
git commit -m "feat: add Allowed Emails to sidebar nav and breadcrumbs"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Verify all pages have `force-dynamic`**

Confirm `src/app/(portal)/admin/allowed-emails/page.tsx` has `export const dynamic = 'force-dynamic'`.

- [ ] **Step 3: Checklist review**

Verify:
- Schema has proper FK references and unique constraint on email ✓
- Queries use `.returning()` on all mutations ✓
- API routes use `getProfile()` + role check ✓
- Route params use `await context.params` ✓
- Login page handles both sign-in and sign-up ✓
- Provision route double-checks whitelist server-side ✓
- `force-dynamic` on admin page ✓
- Sidebar + breadcrumbs updated ✓

- [ ] **Step 4: Commit any remaining fixes, then deploy**

```bash
npm run build && npx vercel deploy --prod --yes
```

---

## Post-Deploy: Supabase Dashboard (Manual)

After deploying, the user must:
1. **Auth → Providers** → disable Google OAuth provider
2. **Auth → Settings → Email** → turn OFF "Enable email confirmations"  
3. **Auth → Settings → Email** → ensure "Enable email sign-up" is ON
4. **Project Settings → Billing** → downgrade to free tier
5. **Add your own email** to the allowed_emails table (via the admin UI or Drizzle Studio)

## Switch Back to Google (Future)

1. Upgrade Supabase to Pro
2. Re-enable Google OAuth provider
3. Revert login page to Google OAuth button
4. The `allowed_emails` table stays dormant
