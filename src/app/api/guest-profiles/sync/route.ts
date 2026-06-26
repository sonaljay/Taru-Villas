import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { syncPropertyArrivals, refreshPropertyStatuses } from '@/lib/oracle/sync'

const bodySchema = z.object({
  propertyId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin' && profile.role !== 'property_manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { propertyId, fromDate, toDate } = parsed.data

    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(propertyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const property = await getPropertyById(propertyId)
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    if (!property.oracleHotelId) {
      return NextResponse.json(
        { error: 'This property has no Oracle Hotel ID set' },
        { status: 400 }
      )
    }

    const pull = await syncPropertyArrivals(
      property.orgId,
      propertyId,
      property.oracleHotelId,
      fromDate,
      toDate
    )
    if (pull.error) return NextResponse.json({ error: pull.error }, { status: 502 })
    const refresh = await refreshPropertyStatuses(propertyId, property.oracleHotelId)

    return NextResponse.json({ pulled: pull.pulled, ...refresh })
  } catch (error) {
    console.error('POST /api/guest-profiles/sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
