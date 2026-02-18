import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getMenuCategoryById } from '@/lib/db/queries/menus'
import {
  getMenuItemsForCategory,
  createMenuItem,
} from '@/lib/db/queries/menus'

const createItemSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  price: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
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
// GET /api/menus/items?categoryId=xxx
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

    const categoryId = request.nextUrl.searchParams.get('categoryId')
    if (!categoryId) {
      return NextResponse.json(
        { error: 'categoryId query parameter is required' },
        { status: 400 }
      )
    }

    const category = await getMenuCategoryById(categoryId)
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const hasAccess = await checkPropertyAccess(profile, category.propertyId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

    const items = await getMenuItemsForCategory(categoryId)
    return NextResponse.json(items)
  } catch (error) {
    console.error('GET /api/menus/items error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/menus/items
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
    const parsed = createItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const category = await getMenuCategoryById(parsed.data.categoryId)
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const hasAccess = await checkPropertyAccess(profile, category.propertyId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

    const item = await createMenuItem({
      ...parsed.data,
      tags: parsed.data.tags ?? [],
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('POST /api/menus/items error:', error)
    return NextResponse.json(
      { error: 'Failed to create menu item' },
      { status: 500 }
    )
  }
}
