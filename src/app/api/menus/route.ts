import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { createMenu, getMenusForProperty } from '@/lib/db/queries/menus'

const createMenuSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.enum(['set', 'a_la_carte']),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(4000).nullable().optional(),
  priceNote: z.string().max(200).nullable().optional(),
  footerNote: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

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

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive)
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const propertyId = request.nextUrl.searchParams.get('propertyId')
    if (!propertyId)
      return NextResponse.json({ error: 'propertyId query parameter is required' }, { status: 400 })

    if (!(await checkPropertyAccess(profile, propertyId)))
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })

    const data = await getMenusForProperty(propertyId)
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/menus error:', error)
    return NextResponse.json({ error: 'Failed to fetch menus' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive)
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = createMenuSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )

    if (!(await checkPropertyAccess(profile, parsed.data.propertyId)))
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })

    const { dayOfWeek, ...rest } = parsed.data
    const menu = await createMenu({ ...rest, dayOfWeek: dayOfWeek ?? null })
    return NextResponse.json(menu, { status: 201 })
  } catch (error) {
    console.error('POST /api/menus error:', error)
    return NextResponse.json({ error: 'Failed to create menu' }, { status: 500 })
  }
}
