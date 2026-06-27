import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTaskTeams, createTaskTeam } from '@/lib/db/queries/tasks'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sortOrder: z.number().int().optional(),
})

export async function GET(_request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const teams = await getTaskTeams(profile.orgId)
    return NextResponse.json(teams)
  } catch (error) {
    console.error('GET /api/tasks/teams error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const { name, sortOrder } = parsed.data
    const team = await createTaskTeam(profile.orgId, name, sortOrder)
    return NextResponse.json(team, { status: 201 })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A team with that name already exists' }, { status: 409 })
    }
    console.error('POST /api/tasks/teams error:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
