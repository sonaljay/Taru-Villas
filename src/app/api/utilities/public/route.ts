import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getLatestReading, upsertReading, upsertOccupancy, getSlotConfig } from '@/lib/db/queries/utilities'
import { getPropertyById } from '@/lib/db/queries/properties'
import { currentISTMinutes, isSlotOpen, slotWindowLabel } from '@/lib/utilities/slot-windows'

const publicReadingSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readingValue: z.number().min(0),
  slot: z.enum(['morning', 'evening', 'night']).optional(),
  note: z.string().max(500).nullable().optional(),
  guestCount: z.number().int().min(0).optional(),
  staffCount: z.number().int().min(0).optional(),
})

// POST /api/utilities/public — submit a reading without auth
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = publicReadingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Water always uses the morning slot; electricity defaults to morning too.
    const slot =
      parsed.data.utilityType === 'electricity'
        ? parsed.data.slot ?? 'morning'
        : 'morning'

    // Electricity slot entry window (±15 min IST). Public users are never admin → always reject if closed.
    if (parsed.data.utilityType === 'electricity') {
      const property = await getPropertyById(parsed.data.propertyId)
      if (!property) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }
      const slotTimes = await getSlotConfig(property.orgId)
      const nowMin = currentISTMinutes()
      if (!isSlotOpen(slot, nowMin, slotTimes)) {
        return NextResponse.json(
          { error: `The ${slot} reading window (${slotWindowLabel(slot, slotTimes)} IST) is closed.` },
          { status: 422 }
        )
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
          error: `Reading must be >= the previous reading (${latest.readingValue} on ${latest.readingDate})`,
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
      status: 'manual',
      note: parsed.data.note ?? null,
      recordedBy: null,
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
        recordedBy: null,
      })
    }

    return NextResponse.json(reading, { status: 201 })
  } catch (error: unknown) {
    console.error('POST /api/utilities/public error:', error)
    return NextResponse.json({ error: 'Failed to save reading' }, { status: 500 })
  }
}
