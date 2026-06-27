import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import {
  getIssuesForAdmin,
  getIssuesForUser,
  type IssueFilters,
} from '@/lib/db/queries/issues'

// ---------------------------------------------------------------------------
// GET /api/issues — List issues with filters
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

    // Staff cannot access issues
    if (profile.role === 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const filters: IssueFilters = {}

    const propertyId = searchParams.get('propertyId')
    if (propertyId) filters.propertyId = propertyId

    const status = searchParams.get('status') as IssueFilters['status'] | null
    if (status && ['open', 'investigating', 'closed'].includes(status)) {
      filters.status = status
    }

    const repeatIssue = searchParams.get('isRepeatIssue')
    if (repeatIssue === 'true') filters.isRepeatIssue = true
    if (repeatIssue === 'false') filters.isRepeatIssue = false

    let issueRows
    if (profile.role === 'admin') {
      issueRows = await getIssuesForAdmin(profile.orgId, filters)
    } else {
      issueRows = await getIssuesForUser(profile.id, filters)
    }

    return NextResponse.json(issueRows)
  } catch (error) {
    console.error('GET /api/issues error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    )
  }
}
