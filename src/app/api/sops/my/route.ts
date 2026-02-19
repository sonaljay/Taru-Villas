import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { getAssignmentsForUser } from '@/lib/db/queries/sops'

// ---------------------------------------------------------------------------
// GET /api/sops/my — Current user's active SOP assignments with completions
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const assignments = await getAssignmentsForUser(profile.id)
    return NextResponse.json(assignments)
  } catch (error) {
    console.error('GET /api/sops/my error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch SOPs' },
      { status: 500 }
    )
  }
}
