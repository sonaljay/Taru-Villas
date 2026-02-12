import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { profiles, organizations, properties, propertyAssignments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Check if the user already has a profile
        const existing = await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1)

        if (!existing[0]) {
          // No profile yet — auto-provision
          // Check if ANY profiles exist; if not, this is the first user → admin
          const allProfiles = await db.select({ id: profiles.id }).from(profiles).limit(1)
          const isFirstUser = allProfiles.length === 0

          // Get the organization
          const orgs = await db.select().from(organizations).limit(1)
          const orgId = orgs[0]?.id

          if (orgId) {
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
          }
        }

        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
