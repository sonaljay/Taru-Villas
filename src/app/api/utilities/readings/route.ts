import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getReadingsForMonth,
  getLatestReading,
  upsertReading,
  upsertOccupancy,
  getSlotConfig,
} from '@/lib/db/queries/utilities'
import { currentISTMinutes, isSlotOpen, slotWindowLabel } from '@/lib/utilities/slot-windows'

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

const createReadingSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readingValue: z.number().min(0),
  slot: z.enum(['morning', 'evening', 'night']).optional(),
  note: z.string().max(500).nullable().optional(),
  guestCount: z.number().int().min(0).optional(),
  staffCount: z.number().int().min(0).optional(),
})

// GET /api/utilities/readings?propertyId=xxx&utilityType=water&year=2026&month=4
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType') as 'water' | 'electricity' | null
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!propertyId || !utilityType || !year || !month) {
      return NextResponse.json(
        { error: 'propertyId, utilityType, year, and month are required' },
        { status: 400 }
      )
    }

    if (!['water', 'electricity'].includes(utilityType)) {
      return NextResponse.json({ error: 'Invalid utilityType' }, { status: 400 })
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const readings = await getReadingsForMonth(
      propertyId,
      utilityType,
      parseInt(year),
      parseInt(month)
    )

    return NextResponse.json(readings)
  } catch (error) {
    console.error('GET /api/utilities/readings error:', error)
    return NextResponse.json({ error: 'Failed to fetch readings' }, { status: 500 })
  }
}

// POST /api/utilities/readings
export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createReadingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, parsed.data.propertyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Water always uses the morning slot; electricity defaults to morning too.
    const slot =
      parsed.data.utilityType === 'electricity'
        ? parsed.data.slot ?? 'morning'
        : 'morning'

    // Electricity slot entry window (±15 min IST). Admins may backfill outside it.
    let status: 'manual' | 'edited' = 'manual'
    if (parsed.data.utilityType === 'electricity') {
      const slotTimes = await getSlotConfig(profile.orgId)
      const nowMin = currentISTMinutes()
      if (!isSlotOpen(slot, nowMin, slotTimes)) {
        if (profile.role !== 'admin') {
          return NextResponse.json(
            {
              error: `The ${slot} reading window (${slotWindowLabel(slot, slotTimes)} IST) is closed.`,
            },
            { status: 422 }
          )
        }
        status = 'edited' // admin backfill outside the window
      }
    }

    // Validate cumulative order against the latest morning reading
    const latest = await getLatestReading(
      parsed.data.propertyId,
      parsed.data.utilityType
    )
    if (
      slot === 'morning' &&
      latest &&
      latest.readingValue !== null &&
      parsed.data.readingValue < parseFloat(latest.readingValue)
    ) {
      return NextResponse.json(
        {
          error: `Reading value must be >= the previous reading (${latest.readingValue} on ${latest.readingDate})`,
        },
        { status: 400 }
      )
    }

    const reading = await upsertReading({
      propertyId: parsed.data.propertyId,
      utilityType: parsed.data.utilityType,
      readingDate: parsed.data.readingDate,
      readingValue: String(parsed.data.readingValue),
      slot,
      status,
      note: parsed.data.note ?? null,
      recordedBy: profile.id,
    })

    // Optional occupancy upsert (once per property/day)
    if (
      parsed.data.guestCount !== undefined ||
      parsed.data.staffCount !== undefined
    ) {
      await upsertOccupancy({
        propertyId: parsed.data.propertyId,
        logDate: parsed.data.readingDate,
        guestCount: parsed.data.guestCount ?? 0,
        staffCount: parsed.data.staffCount ?? 0,
        recordedBy: profile.id,
      })
    }

    return NextResponse.json(reading, { status: 201 })
  } catch (error: unknown) {
    console.error('POST /api/utilities/readings error:', error)
    return NextResponse.json({ error: 'Failed to create reading' }, { status: 500 })
  }
}
