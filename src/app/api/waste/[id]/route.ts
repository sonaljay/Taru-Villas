import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getWasteLogById, updateWasteLog, deleteWasteLog } from '@/lib/db/queries/waste'

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

const updateSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paperKg: z.number().min(0).optional(),
  glassKg: z.number().min(0).optional(),
  plasticKg: z.number().min(0).optional(),
  foodKg: z.number().min(0).optional(),
  metalKg: z.number().min(0).optional(),
  electronicKg: z.number().min(0).optional(),
  note: z.string().max(500).nullable().optional(),
})

// PATCH /api/waste/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const existing = await getWasteLogById(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updateData: {
      logDate?: string
      paperKg?: string
      glassKg?: string
      plasticKg?: string
      foodKg?: string
      metalKg?: string
      electronicKg?: string
      note?: string | null
    } = {}
    if (parsed.data.logDate !== undefined) updateData.logDate = parsed.data.logDate
    if (parsed.data.paperKg !== undefined) updateData.paperKg = String(parsed.data.paperKg)
    if (parsed.data.glassKg !== undefined) updateData.glassKg = String(parsed.data.glassKg)
    if (parsed.data.plasticKg !== undefined) updateData.plasticKg = String(parsed.data.plasticKg)
    if (parsed.data.foodKg !== undefined) updateData.foodKg = String(parsed.data.foodKg)
    if (parsed.data.metalKg !== undefined) updateData.metalKg = String(parsed.data.metalKg)
    if (parsed.data.electronicKg !== undefined) updateData.electronicKg = String(parsed.data.electronicKg)
    if (parsed.data.note !== undefined) updateData.note = parsed.data.note

    const updated = await updateWasteLog(id, updateData)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/waste/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update waste log' }, { status: 500 })
  }
}

// DELETE /api/waste/[id]
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const existing = await getWasteLogById(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const deleted = await deleteWasteLog(id)
    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error('DELETE /api/waste/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete waste log' }, { status: 500 })
  }
}
