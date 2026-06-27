import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getProjects, createProject } from '@/lib/db/queries/projects'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
  targetDate: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === '1'
    const items = await getProjects(profile.orgId, { includeArchived })
    return NextResponse.json(items)
  } catch (error) {
    console.error('GET /api/projects error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const data = parsed.data
    const project = await createProject({
      ...data,
      orgId: profile.orgId,
      createdBy: profile.id,
      description: data.description ?? null,
      color: data.color ?? null,
      targetDate: data.targetDate ?? null,
    })
    return NextResponse.json(project, { status: 201 })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A project with that name already exists' }, { status: 409 })
    }
    console.error('POST /api/projects error:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
