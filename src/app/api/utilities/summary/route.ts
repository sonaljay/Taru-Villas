import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getReadingsForMonth,
  getPreviousMonthLastReading,
  getTiersForProperty,
  getConsumptionHistory,
  getOccupancyForMonth,
  getElectricityBands,
  getWaterKpiTarget,
} from '@/lib/db/queries/utilities'
import {
  predictMonthlyBill,
  calculateDailyConsumption,
  computeElectricityBreakdown,
  resolveBandTarget,
  computeKpiAchievement,
  type TierInput,
  type SlotRow,
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
    const [monthReadings, prevReading, tiers, history, occupancy, bands, waterTarget] =
      await Promise.all([
        getReadingsForMonth(propertyId, utilityType, yearNum, monthNum),
        getPreviousMonthLastReading(propertyId, utilityType, yearNum, monthNum),
        getTiersForProperty(propertyId, utilityType),
        getConsumptionHistory(propertyId, utilityType, 6),
        getOccupancyForMonth(propertyId, yearNum, monthNum),
        utilityType === 'electricity'
          ? getElectricityBands(propertyId)
          : Promise.resolve([]),
        utilityType === 'water'
          ? getWaterKpiTarget(propertyId)
          : Promise.resolve(null),
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

    // Occupancy lookup by date
    const occByDate = new Map(
      occupancy.map((o) => [o.logDate, o])
    )

    type EnrichedDayRow = {
      date: string
      readingValue: number | null
      day: number | null
      peak: number | null
      offPeak: number | null
      total: number | null
      pending: boolean
      guestCount: number | null
      staffCount: number | null
      target: number | null
      achieved: boolean | null
    }

    let dailyRows: EnrichedDayRow[] = []

    if (utilityType === 'electricity') {
      const slotRows: SlotRow[] = monthReadings.map((r) => ({
        date: r.readingDate,
        morning: parseFloat(r.readingValue),
        evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
        night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
      }))
      const bandInputs = bands.map((b) => ({
        minGuests: b.minGuests,
        targetUnits: parseFloat(b.targetUnits),
      }))
      const breakdown = computeElectricityBreakdown(slotRows)

      dailyRows = breakdown.map((b, i) => {
        const occ = occByDate.get(b.date)
        const guestCount = occ ? occ.guestCount : null
        const target = resolveBandTarget(guestCount, bandInputs)
        return {
          date: b.date,
          readingValue: slotRows[i].morning,
          day: b.day,
          peak: b.peak,
          offPeak: b.offPeak,
          total: b.total,
          pending: b.pending,
          guestCount,
          staffCount: occ ? occ.staffCount : null,
          target,
          achieved:
            b.total !== null && target !== null ? b.total <= target : null,
        }
      })
    } else {
      // Water: daily usage = consecutive reading_value deltas; flat target
      const target = waterTarget ? parseFloat(waterTarget.dailyTargetUnits) : null
      dailyRows = monthReadings.map((r, i) => {
        const prev = i > 0 ? monthReadings[i - 1] : null
        const total =
          prev !== null
            ? parseFloat(r.readingValue) - parseFloat(prev.readingValue)
            : null
        const occ = occByDate.get(r.readingDate)
        return {
          date: r.readingDate,
          readingValue: parseFloat(r.readingValue),
          day: null,
          peak: null,
          offPeak: null,
          total,
          pending: total === null,
          guestCount: occ ? occ.guestCount : null,
          staffCount: occ ? occ.staffCount : null,
          target,
          achieved: total !== null && target !== null ? total <= target : null,
        }
      })
    }

    const achievement = computeKpiAchievement(
      dailyRows.map((r) => ({ total: r.total, target: r.target }))
    )
    const kpiConfigured =
      utilityType === 'electricity' ? bands.length > 0 : waterTarget !== null

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
      dailyRows,
      kpi: {
        configured: kpiConfigured,
        pct: achievement.pct,
        evaluatedDays: achievement.evaluatedDays,
        achievedDays: achievement.achievedDays,
      },
    })
  } catch (error) {
    console.error('GET /api/utilities/summary error:', error)
    return NextResponse.json({ error: 'Failed to compute summary' }, { status: 500 })
  }
}

