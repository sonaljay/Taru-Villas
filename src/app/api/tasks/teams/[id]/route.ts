import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { updateTaskTeam, deleteTaskTeam } from '@/lib/db/queries/tasks'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const team = await updateTaskTeam(id, parsed.data)
    return NextResponse.json(team)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A team with that name already exists' }, { status: 409 })
    }
    console.error('PATCH /api/tasks/teams/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const deleted = await deleteTaskTeam(id)
    return NextResponse.json(deleted)
  } catch (error) {
    console.error('DELETE /api/tasks/teams/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
