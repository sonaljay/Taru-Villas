import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getTaskById, updateTaskStatus } from '@/lib/db/queries/tasks'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const updateTaskSchema = z.object({
  status: z.enum(['investigating', 'closed']),
  closingNotes: z.string().max(2000).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/tasks/[id] — Task detail
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
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

    const task = await getTaskById(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // PMs can only see tasks for their assigned properties
    if (profile.role !== 'admin') {
      const userProps = await getUserProperties(profile.id, profile.role as 'property_manager' | 'staff')
      if (userProps && !userProps.includes(task.propertyId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tasks/[id] — Update task status
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
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

    const task = await getTaskById(id)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // PMs can only update tasks for their assigned properties
    if (profile.role !== 'admin') {
      const userProps = await getUserProperties(profile.id, profile.role as 'property_manager' | 'staff')
      if (userProps && !userProps.includes(task.propertyId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const parsed = updateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { status, closingNotes } = parsed.data

    // Closing requires closing notes
    if (status === 'closed' && (!closingNotes || closingNotes.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Closing notes are required when closing a task' },
        { status: 400 }
      )
    }

    const updated = await updateTaskStatus(id, status, closingNotes, profile.id)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid transition')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('PATCH /api/tasks/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    )
  }
}
