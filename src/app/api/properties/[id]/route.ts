import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getPropertyById,
  updateProperty,
  deleteProperty,
} from '@/lib/db/queries/properties'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const updatePropertySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  slug: z.string().min(1).max(255).optional(),
  location: z.string().max(500).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

async function checkPropertyAccess(profile: { id: string; role: string }, propertyId: string) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(profile.id, profile.role as 'admin' | 'property_manager' | 'staff')
  if (!userProps) return true // null means admin — all access
  return userProps.includes(propertyId)
}

// ---------------------------------------------------------------------------
// GET /api/properties/[id]
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

    const hasAccess = await checkPropertyAccess(profile, id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })
    }

    const property = await getPropertyById(id)
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    return NextResponse.json(property)
  } catch (error) {
    console.error('GET /api/properties/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch property' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/properties/[id]
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

    const existing = await getPropertyById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updatePropertySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updated = await updateProperty(id, parsed.data)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/properties/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update property' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/properties/[id]
// ?hard=true → permanent delete (removes property + assignments)
// default   → soft delete (set is_active = false)
// ---------------------------------------------------------------------------

export async function DELETE(
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

    const existing = await getPropertyById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const hard = request.nextUrl.searchParams.get('hard') === 'true'

    if (hard) {
      await deleteProperty(id)
      return NextResponse.json({ success: true, deleted: id })
    }

    const deactivated = await updateProperty(id, { isActive: false })
    return NextResponse.json(deactivated)
  } catch (error) {
    console.error('DELETE /api/properties/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete property' },
      { status: 500 }
    )
  }
}
