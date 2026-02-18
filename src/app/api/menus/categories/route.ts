import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getMenuCategoriesForProperty,
  createMenuCategory,
} from '@/lib/db/queries/menus'

const createCategorySchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
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

// ---------------------------------------------------------------------------
// GET /api/menus/categories?propertyId=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role === 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const propertyId = request.nextUrl.searchParams.get('propertyId')
    if (!propertyId) {
      return NextResponse.json(
        { error: 'propertyId query parameter is required' },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

    const categories = await getMenuCategoriesForProperty(propertyId)
    return NextResponse.json(categories)
  } catch (error) {
    console.error('GET /api/menus/categories error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu categories' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/menus/categories
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role === 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createCategorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, parsed.data.propertyId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

    const category = await createMenuCategory(parsed.data)
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('POST /api/menus/categories error:', error)
    return NextResponse.json(
      { error: 'Failed to create menu category' },
      { status: 500 }
    )
  }
}
