import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { updateGuestLinkStatus } from '@/lib/db/queries/guest-links'

const patchSchema = z.object({
  isActive: z.boolean(),
})

// PATCH /api/admin/guest-links/[id] — toggle active status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updated = await updateGuestLinkStatus(id, parsed.data.isActive)
    if (!updated) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/admin/guest-links/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update guest link' },
      { status: 500 }
    )
  }
}
