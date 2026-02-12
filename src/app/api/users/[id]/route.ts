import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import {
  getProfileById,
  updateProfile,
} from '@/lib/db/queries/profiles'
import { getProfileWithAssignments } from '@/lib/db/queries/profiles'
import { db } from '@/lib/db'
import { propertyAssignments } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  role: z.enum(['admin', 'property_manager', 'staff']).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  propertyIds: z.array(z.string().uuid()).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/users/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    // Users can view their own profile; admins can view any profile
    if (profile.role !== 'admin' && profile.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await getProfileWithAssignments(id)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('GET /api/users/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const existing = await getProfileById(id)
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { propertyIds, ...profileData } = parsed.data

    // Update profile fields if any provided
    let updatedProfile = existing
    if (Object.keys(profileData).length > 0) {
      const result = await updateProfile(id, profileData)
      if (result) updatedProfile = result
    }

    // Update property assignments if provided
    if (propertyIds !== undefined) {
      // Remove all existing assignments
      await db
        .delete(propertyAssignments)
        .where(eq(propertyAssignments.userId, id))

      // Insert new assignments
      if (propertyIds.length > 0) {
        await db.insert(propertyAssignments).values(
          propertyIds.map((propertyId) => ({
            userId: id,
            propertyId,
          }))
        )
      }
    }

    // Return the updated profile with assignments
    const result = await getProfileWithAssignments(id)

    return NextResponse.json(result)
  } catch (error) {
    console.error('PATCH /api/users/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/users/[id] — Deactivate user (soft delete)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    // Prevent self-deactivation
    if (profile.id === id) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }

    const existing = await getProfileById(id)
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deactivated = await updateProfile(id, { isActive: false })

    return NextResponse.json(deactivated)
  } catch (error) {
    console.error('DELETE /api/users/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate user' },
      { status: 500 }
    )
  }
}
