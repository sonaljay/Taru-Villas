import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getWasteSummaryForMonth,
  getWasteHistory,
  getWasteLogsForMonth,
} from '@/lib/db/queries/waste'

async function checkPropertyAccess(
  profile: { id: string; role: string },
  propertyId: string
) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(
    profile.id,
    profile.role as 'admin' | 'property_manager' | 'staff'
  )
  if (!userProps) return true
  return userProps.includes(propertyId)
}

// GET /api/waste/summary?propertyId=xxx&year=2026&month=6
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!propertyId || !year || !month) {
      return NextResponse.json(
        { error: 'propertyId, year, and month are required' },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const yearNum = parseInt(year)
    const monthNum = parseInt(month)

    const [summary, history, monthLogs] = await Promise.all([
      getWasteSummaryForMonth(propertyId, yearNum, monthNum),
      getWasteHistory(propertyId, 6),
      getWasteLogsForMonth(propertyId, yearNum, monthNum),
    ])

    return NextResponse.json({ summary, history, logCount: monthLogs.length })
  } catch (error) {
    console.error('GET /api/waste/summary error:', error)
    return NextResponse.json({ error: 'Failed to compute summary' }, { status: 500 })
  }
}
