import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { upsertOccupancy } from '@/lib/db/queries/utilities'

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

const occupancySchema = z.object({
  propertyId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().min(0),
  staffCount: z.number().int().min(0),
})

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = occupancySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    if (!(await checkPropertyAccess(profile, parsed.data.propertyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const row = await upsertOccupancy({
      propertyId: parsed.data.propertyId,
      logDate: parsed.data.logDate,
      guestCount: parsed.data.guestCount,
      staffCount: parsed.data.staffCount,
      recordedBy: profile.id,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    console.error('POST /api/utilities/occupancy error:', error)
    return NextResponse.json({ error: 'Failed to save occupancy' }, { status: 500 })
  }
}
