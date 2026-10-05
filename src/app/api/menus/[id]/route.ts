import { canAccessCatalogueProperty } from '@/lib/catalogues/access'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getMenuById, updateMenu, deleteMenu } from '@/lib/db/queries/menus'

type RouteContext = { params: Promise<{ id: string }> }

const updateMenuSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(4000).nullable().optional(),
  priceNote: z.string().max(200).nullable().optional(),
  footerNote: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})


export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const menu = await getMenuById(id)
    if (!menu) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canAccessCatalogueProperty(profile, menu.propertyId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = updateMenuSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )

    const updated = await updateMenu(id, parsed.data)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/menus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update menu' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const menu = await getMenuById(id)
    if (!menu) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canAccessCatalogueProperty(profile, menu.propertyId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await deleteMenu(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/menus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete menu' }, { status: 500 })
  }
}
