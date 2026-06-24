import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getSlotConfig, upsertSlotConfig } from '@/lib/db/queries/utilities'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const upsertSlotSchema = z.object({
  morningTime: z.string().regex(timeRegex),
  eveningTime: z.string().regex(timeRegex),
  nightTime: z.string().regex(timeRegex),
})

// GET /api/utilities/slot-config
export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(await getSlotConfig(profile.orgId))
  } catch (error) {
    console.error('GET /api/utilities/slot-config error:', error)
    return NextResponse.json({ error: 'Failed to fetch slot config' }, { status: 500 })
  }
}

// PUT /api/utilities/slot-config — admin only
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const parsed = upsertSlotSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const result = await upsertSlotConfig(profile.orgId, parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/slot-config error:', error)
    return NextResponse.json({ error: 'Failed to update slot config' }, { status: 500 })
  }
}
