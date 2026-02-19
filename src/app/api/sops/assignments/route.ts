import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getAssignmentsForTemplate,
  createAssignment,
} from '@/lib/db/queries/sops'

// ---------------------------------------------------------------------------
// GET /api/sops/assignments?templateId=... — List assignments for a template
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

    const templateId = request.nextUrl.searchParams.get('templateId')
    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      )
    }

    let assignments = await getAssignmentsForTemplate(templateId)

    // PM: filter to only their properties
    if (profile.role === 'property_manager') {
      const propIds = await getUserProperties(profile.id, profile.role)
      if (propIds) {
        assignments = assignments.filter((a) => propIds.includes(a.propertyId))
      }
    }

    return NextResponse.json(assignments)
  } catch (error) {
    console.error('GET /api/sops/assignments error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/sops/assignments — Create an assignment
// ---------------------------------------------------------------------------

const createAssignmentSchema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
  userId: z.string().uuid(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
  deadlineDay: z.number().int().min(0).max(31).nullable().optional(),
  notifyOnOverdue: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const parsed = createAssignmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assignment = await createAssignment({
      ...parsed.data,
      deadlineDay: parsed.data.deadlineDay ?? null,
      notifyOnOverdue: parsed.data.notifyOnOverdue ?? false,
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (error) {
    console.error('POST /api/sops/assignments error:', error)
    return NextResponse.json(
      { error: 'Failed to create assignment' },
      { status: 500 }
    )
  }
}
