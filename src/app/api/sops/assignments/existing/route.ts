import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { getExistingAssignmentPairs } from '@/lib/db/queries/sops'

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const templateId = request.nextUrl.searchParams.get('templateId')
    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
    }

    const pairs = await getExistingAssignmentPairs(templateId)
    return NextResponse.json(pairs)
  } catch (error) {
    console.error('GET /api/sops/assignments/existing error:', error)
    return NextResponse.json({ error: 'Failed to fetch existing assignments' }, { status: 500 })
  }
}
