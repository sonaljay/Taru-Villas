import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getReadingById, updateReading, deleteReading } from '@/lib/db/queries/utilities'

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

const updateReadingSchema = z.object({
  readingValue: z.number().min(0).optional(),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).nullable().optional(),
})

// PATCH /api/utilities/readings/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const existing = await getReadingById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateReadingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updateData: { readingValue?: string; readingDate?: string; note?: string | null } = {}
    if (parsed.data.readingValue !== undefined) {
      updateData.readingValue = String(parsed.data.readingValue)
    }
    if (parsed.data.readingDate !== undefined) {
      updateData.readingDate = parsed.data.readingDate
    }
    if (parsed.data.note !== undefined) {
      updateData.note = parsed.data.note
    }

    const updated = await updateReading(id, updateData)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/utilities/readings/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update reading' }, { status: 500 })
  }
}

// DELETE /api/utilities/readings/[id]
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const existing = await getReadingById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const deleted = await deleteReading(id)
    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error('DELETE /api/utilities/readings/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete reading' }, { status: 500 })
  }
}
