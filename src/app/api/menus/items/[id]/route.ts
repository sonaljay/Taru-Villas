import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getMenuItemById,
  getMenuCategoryById,
  updateMenuItem,
  deleteMenuItem,
} from '@/lib/db/queries/menus'

const updateItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  price: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

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
// PATCH /api/menus/items/[id]
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
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

    const existing = await getMenuItemById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    const category = await getMenuCategoryById(existing.categoryId)
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

    const body = await request.json()
    const parsed = updateItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { tags, ...rest } = parsed.data
    const updated = await updateMenuItem(id, {
      ...rest,
      ...(tags !== undefined && { tags: tags ?? [] }),
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/menus/items/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update menu item' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/menus/items/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
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

    const existing = await getMenuItemById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    }

    const category = await getMenuCategoryById(existing.categoryId)
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

    await deleteMenuItem(id)
    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    console.error('DELETE /api/menus/items/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    )
  }
}
