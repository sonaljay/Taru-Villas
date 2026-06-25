import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getWaterKpiTarget, upsertWaterKpiTarget } from '@/lib/db/queries/utilities'

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

const upsertTargetSchema = z.object({
  propertyId: z.string().uuid(),
  dailyTargetUnits: z.number().min(0),
})

// GET /api/utilities/kpis?propertyId=xxx  (water flat target)
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const propertyId = new URL(request.url).searchParams.get('propertyId')
    if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })

    if (!(await checkPropertyAccess(profile, propertyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(await getWaterKpiTarget(propertyId))
  } catch (error) {
    console.error('GET /api/utilities/kpis error:', error)
    return NextResponse.json({ error: 'Failed to fetch target' }, { status: 500 })
  }
}

// PUT /api/utilities/kpis — admin only
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const parsed = upsertTargetSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const result = await upsertWaterKpiTarget(
      parsed.data.propertyId,
      String(parsed.data.dailyTargetUnits)
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/kpis error:', error)
    return NextResponse.json({ error: 'Failed to update target' }, { status: 500 })
  }
}
