import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getElectricityBands, upsertElectricityBands } from '@/lib/db/queries/utilities'

const upsertBandsSchema = z.object({
  propertyId: z.string().uuid(),
  bands: z
    .array(
      z.object({
        minGuests: z.number().int().min(0),
        targetUnits: z.number().min(0),
      })
    )
    .min(1)
    .max(20),
})

// GET /api/utilities/kpi-bands?propertyId=xxx
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const propertyId = new URL(request.url).searchParams.get('propertyId')
    if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })

    return NextResponse.json(await getElectricityBands(propertyId))
  } catch (error) {
    console.error('GET /api/utilities/kpi-bands error:', error)
    return NextResponse.json({ error: 'Failed to fetch bands' }, { status: 500 })
  }
}

// PUT /api/utilities/kpi-bands — admin only, replaces all bands
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const parsed = upsertBandsSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Reject duplicate minGuests thresholds (unique constraint backstop)
    const thresholds = parsed.data.bands.map((b) => b.minGuests)
    if (new Set(thresholds).size !== thresholds.length) {
      return NextResponse.json(
        { error: 'Guest-count thresholds must be unique' },
        { status: 400 }
      )
    }

    const result = await upsertElectricityBands(
      parsed.data.propertyId,
      parsed.data.bands.map((b) => ({
        minGuests: b.minGuests,
        targetUnits: String(b.targetUnits),
      }))
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/kpi-bands error:', error)
    return NextResponse.json({ error: 'Failed to update bands' }, { status: 500 })
  }
}
