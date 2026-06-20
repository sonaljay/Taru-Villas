import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getWasteLogsForMonth, createWasteLog } from '@/lib/db/queries/waste'

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

const createSchema = z.object({
  propertyId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paperKg: z.number().min(0),
  glassKg: z.number().min(0),
  plasticKg: z.number().min(0),
  foodKg: z.number().min(0),
  metalKg: z.number().min(0),
  electronicKg: z.number().min(0),
  note: z.string().max(500).nullable().optional(),
})

// GET /api/waste?propertyId=xxx&year=2026&month=6
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!propertyId || !year || !month) {
      return NextResponse.json(
        { error: 'propertyId, year, and month are required' },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const logs = await getWasteLogsForMonth(propertyId, parseInt(year), parseInt(month))
    return NextResponse.json(logs)
  } catch (error) {
    console.error('GET /api/waste error:', error)
    return NextResponse.json({ error: 'Failed to fetch waste logs' }, { status: 500 })
  }
}

// POST /api/waste
export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, parsed.data.propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const log = await createWasteLog({
      propertyId: parsed.data.propertyId,
      logDate: parsed.data.logDate,
      paperKg: String(parsed.data.paperKg),
      glassKg: String(parsed.data.glassKg),
      plasticKg: String(parsed.data.plasticKg),
      foodKg: String(parsed.data.foodKg),
      metalKg: String(parsed.data.metalKg),
      electronicKg: String(parsed.data.electronicKg),
      note: parsed.data.note ?? null,
      recordedBy: profile.id,
    })

    return NextResponse.json(log, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'A waste log already exists for this date — edit the existing row instead.' },
        { status: 409 }
      )
    }
    console.error('POST /api/waste error:', error)
    return NextResponse.json({ error: 'Failed to create waste log' }, { status: 500 })
  }
}
