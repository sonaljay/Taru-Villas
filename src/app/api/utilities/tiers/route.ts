import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getTiersForProperty, upsertTiers } from '@/lib/db/queries/utilities'

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

const upsertTiersSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  tiers: z
    .array(
      z.object({
        tierNumber: z.number().int().min(1).max(6),
        minUnits: z.number().min(0),
        maxUnits: z.number().min(0).nullable(),
        ratePerUnit: z.number().min(0),
      })
    )
    .min(1)
    .max(6),
})

// GET /api/utilities/tiers?propertyId=xxx&utilityType=water
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType') as 'water' | 'electricity' | null

    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tiers = await getTiersForProperty(
      propertyId,
      utilityType ?? undefined
    )

    return NextResponse.json(tiers)
  } catch (error) {
    console.error('GET /api/utilities/tiers error:', error)
    return NextResponse.json({ error: 'Failed to fetch tiers' }, { status: 500 })
  }
}

// PUT /api/utilities/tiers — admin only, replaces all tiers for a property+type
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only for tier configuration
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = upsertTiersSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Convert numbers to strings for Drizzle numeric columns
    type TierItem = { tierNumber: number; minUnits: number; maxUnits: number | null; ratePerUnit: number }
    const tiersData = parsed.data.tiers.map((t: TierItem) => ({
      tierNumber: t.tierNumber,
      minUnits: String(t.minUnits),
      maxUnits: t.maxUnits !== null ? String(t.maxUnits) : null,
      ratePerUnit: String(t.ratePerUnit),
    }))

    const result = await upsertTiers(
      parsed.data.propertyId,
      parsed.data.utilityType,
      tiersData
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/tiers error:', error)
    return NextResponse.json({ error: 'Failed to update tiers' }, { status: 500 })
  }
}
