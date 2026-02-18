import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getExcursionById,
  updateExcursion,
  deleteExcursion,
} from '@/lib/db/queries/excursions'

const updateExcursionSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  price: z.string().max(100).nullable().optional(),
  duration: z.string().max(100).nullable().optional(),
  bookingUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

async function checkPropertyAccess(
  profile: { id: string; role: string },
  propertyId: string
) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(
    profile.id,
    profile.role as 'admin' | 'property_manager' | 'staff'
  )
  if (!userProps) return true
  return userProps.includes(propertyId)
}

// ---------------------------------------------------------------------------
// PATCH /api/excursions/[id]
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role === 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existing = await getExcursionById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Excursion not found' }, { status: 404 })
    }

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = updateExcursionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updated = await updateExcursion(id, parsed.data)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/excursions/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update excursion' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/excursions/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role === 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existing = await getExcursionById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Excursion not found' }, { status: 404 })
    }

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

    await deleteExcursion(id)
    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    console.error('DELETE /api/excursions/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete excursion' },
      { status: 500 }
    )
  }
}
