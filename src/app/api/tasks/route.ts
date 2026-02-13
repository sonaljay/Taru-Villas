import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getTasksForAdmin,
  getTasksForUser,
  type TaskFilters,
} from '@/lib/db/queries/tasks'

// ---------------------------------------------------------------------------
// GET /api/tasks — List tasks with filters
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

    // Staff cannot access tasks
    if (profile.role === 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const filters: TaskFilters = {}

    const propertyId = searchParams.get('propertyId')
    if (propertyId) filters.propertyId = propertyId

    const status = searchParams.get('status') as TaskFilters['status'] | null
    if (status && ['open', 'investigating', 'closed'].includes(status)) {
      filters.status = status
    }

    const repeatIssue = searchParams.get('isRepeatIssue')
    if (repeatIssue === 'true') filters.isRepeatIssue = true
    if (repeatIssue === 'false') filters.isRepeatIssue = false

    let tasks
    if (profile.role === 'admin') {
      tasks = await getTasksForAdmin(profile.orgId, filters)
    } else {
      tasks = await getTasksForUser(profile.id, filters)
    }

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}
