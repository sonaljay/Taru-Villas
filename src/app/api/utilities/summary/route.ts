import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getReadingsForMonth,
  getPreviousMonthLastReading,
  getTiersForProperty,
  getConsumptionHistory,
} from '@/lib/db/queries/utilities'
import {
  predictMonthlyBill,
  calculateDailyConsumption,
  type TierInput,
} from '@/lib/utilities/calculations'

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

// GET /api/utilities/summary?propertyId=xxx&utilityType=water&year=2026&month=4
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType') as 'water' | 'electricity' | null
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!propertyId || !utilityType || !year || !month) {
      return NextResponse.json(
        { error: 'propertyId, utilityType, year, and month are required' },
        { status: 400 }
      )
    }

    if (!['water', 'electricity'].includes(utilityType)) {
      return NextResponse.json({ error: 'Invalid utilityType' }, { status: 400 })
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const yearNum = parseInt(year)
    const monthNum = parseInt(month)

    // Fetch data in parallel
    const [monthReadings, prevReading, tiers, history] = await Promise.all([
      getReadingsForMonth(propertyId, utilityType, yearNum, monthNum),
      getPreviousMonthLastReading(propertyId, utilityType, yearNum, monthNum),
      getTiersForProperty(propertyId, utilityType),
      getConsumptionHistory(propertyId, utilityType, 6),
    ])

    // Build readings array for calculations, prepending previous month's last reading as baseline
    const readingsForCalc: { date: string; value: number }[] = []

    if (prevReading) {
      readingsForCalc.push({
        date: prevReading.readingDate,
        value: parseFloat(prevReading.readingValue),
      })
    }

    for (const r of monthReadings) {
      readingsForCalc.push({
        date: r.readingDate,
        value: parseFloat(r.readingValue),
      })
    }

    // Convert tiers for calculation functions
    const tierInputs: TierInput[] = tiers.map((t) => ({
      tierNumber: t.tierNumber,
      minUnits: parseFloat(t.minUnits),
      maxUnits: t.maxUnits ? parseFloat(t.maxUnits) : null,
      ratePerUnit: parseFloat(t.ratePerUnit),
    }))

    // Calculate prediction
    const prediction = predictMonthlyBill(readingsForCalc, tierInputs, yearNum, monthNum)

    // Calculate daily consumption
    const dailyConsumption = calculateDailyConsumption(readingsForCalc)

    return NextResponse.json({
      prediction,
      dailyConsumption,
      history: history.map((h) => ({
        month: h.month,
        consumption: Number(h.consumption),
        readingCount: h.readingCount,
      })),
      tiersConfigured: tiers.length > 0,
      readingCount: monthReadings.length,
    })
  } catch (error) {
    console.error('GET /api/utilities/summary error:', error)
    return NextResponse.json({ error: 'Failed to compute summary' }, { status: 500 })
  }
}

