import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import { updateAssignment, deleteAssignment } from '@/lib/db/queries/sops'

type Params = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// PATCH /api/sops/assignments/[id] — Update assignment
// ---------------------------------------------------------------------------

const updateAssignmentSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  deadlineDay: z.number().int().min(0).max(31).nullable().optional(),
  isActive: z.boolean().optional(),
  notifyOnOverdue: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = updateAssignmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assignment = await updateAssignment(id, parsed.data)
    if (!assignment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(assignment)
  } catch (error) {
    console.error('PATCH /api/sops/assignments/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update assignment' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/sops/assignments/[id] — Delete assignment
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await deleteAssignment(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/sops/assignments/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete assignment' },
      { status: 500 }
    )
  }
}
