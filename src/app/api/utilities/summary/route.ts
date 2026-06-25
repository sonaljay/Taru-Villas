import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getReadingsInRange,
  getBaselineReading,
  getOccupancyInRange,
  getTiersForProperty,
  getConsumptionHistory,
  getKpiBands,
} from '@/lib/db/queries/utilities'
import {
  predictMonthlyBill,
  computeElectricityBreakdown,
  resolveBandTarget,
  computeKpiAchievement,
  dayPenaltyState,
  pctDelta,
  calculateRangeCost,
  type TierInput,
  type SlotRow,
} from '@/lib/utilities/calculations'
import { previousPeriod, monthKey, rangeDays } from '@/lib/utilities/date-ranges'

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
  penalty: 'missed' | 'edited' | 'normal'
}

type ReadingRow = {
  readingDate: string
  readingValue: string | null
  eveningReading: string | null
  nightReading: string | null
  morningStatus: 'manual' | 'autofilled' | 'edited' | null
  eveningStatus: 'manual' | 'autofilled' | 'edited' | null
  nightStatus: 'manual' | 'autofilled' | 'edited' | null
}

function buildDailyRows(
  utilityType: 'water' | 'electricity',
  readings: ReadingRow[],
  baseline: ReadingRow | null,
  occByDate: Map<string, { guestCount: number; staffCount: number }>,
  bandInputs: { minGuests: number; targetUnits: number }[]
): EnrichedDayRow[] {
  if (utilityType === 'electricity') {
    const slotRows: SlotRow[] = readings.map((r) => ({
      date: r.readingDate,
      morning: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
      night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
    }))
    const breakdown = computeElectricityBreakdown(slotRows)
    return breakdown.map((b, i) => {
      const r = readings[i]
      const occ = occByDate.get(b.date)
      const guestCount = occ ? occ.guestCount : null
      const target = resolveBandTarget(guestCount, bandInputs)
      const penalty = dayPenaltyState({ morning: r.morningStatus, evening: r.eveningStatus, night: r.nightStatus })
      const achieved = penalty === 'missed' ? false : b.total !== null && target !== null ? b.total <= target : null
      return {
        date: b.date, readingValue: slotRows[i].morning, day: b.day, peak: b.peak, offPeak: b.offPeak,
        total: b.total, pending: b.pending, guestCount, staffCount: occ ? occ.staffCount : null,
        target, achieved, penalty,
      }
    })
  }
  // Water: consecutive deltas (baseline gives day-0 a predecessor)
  return readings.map((r, i) => {
    const prev = i > 0 ? readings[i - 1] : baseline && baseline.readingValue !== null ? baseline : null
    const rawTotal = prev && prev.readingValue !== null && r.readingValue !== null
      ? parseFloat(r.readingValue) - parseFloat(prev.readingValue) : null
    const total = rawTotal !== null && rawTotal >= 0 ? rawTotal : null
    const occ = occByDate.get(r.readingDate)
    const guestCount = occ ? occ.guestCount : null
    const target = resolveBandTarget(guestCount, bandInputs)
    return {
      date: r.readingDate, readingValue: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      day: null, peak: null, offPeak: null, total, pending: total === null,
      guestCount, staffCount: occ ? occ.staffCount : null,
      target, achieved: total !== null && target !== null ? total <= target : null,
      penalty: 'normal' as const,
    }
  })
}

function aggregatePeriod(
  dailyRows: EnrichedDayRow[],
  readings: ReadingRow[],
  baseline: ReadingRow | null,
  from: string, to: string,
  tierInputs: TierInput[]
) {
  // Total consumption = last in-range reading_value - baseline reading_value (clamp >=0)
  const lastWithValue = [...readings].reverse().find((r) => r.readingValue !== null)
  const baseVal = baseline && baseline.readingValue !== null ? parseFloat(baseline.readingValue) : null
  const lastVal = lastWithValue ? parseFloat(lastWithValue.readingValue as string) : null
  const rawTotal = baseVal !== null && lastVal !== null ? lastVal - baseVal : null
  const totalConsumption = rawTotal !== null && rawTotal >= 0 ? rawTotal : null
  const days = rangeDays(from, to)
  const avgPerDay = totalConsumption !== null ? totalConsumption / days : null
  // Cost: sum per-calendar-month tiered cost from dailyRows' totals
  const monthly = new Map<string, number>()
  for (const row of dailyRows) if (row.total !== null) monthly.set(monthKey(row.date), (monthly.get(monthKey(row.date)) ?? 0) + row.total)
  const totalCost = tierInputs.length > 0 ? calculateRangeCost([...monthly.values()], tierInputs) : null
  const ach = computeKpiAchievement(dailyRows.map((r) => ({ total: r.total, target: r.target, missed: r.penalty === 'missed' })))
  return { totalConsumption, avgPerDay, totalCost, kpiPct: ach.pct, kpiEvaluatedDays: ach.evaluatedDays, kpiAchievedDays: ach.achievedDays }
}

// GET /api/utilities/summary?propertyId=xxx&utilityType=water&from=2026-06-01&to=2026-06-25&isThisMonth=1
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType') as 'water' | 'electricity' | null
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const isThisMonth = searchParams.get('isThisMonth') === '1'

    if (!propertyId || !utilityType || !from || !to) {
      return NextResponse.json({ error: 'propertyId, utilityType, from, to are required' }, { status: 400 })
    }
    if (!['water', 'electricity'].includes(utilityType)) {
      return NextResponse.json({ error: 'Invalid utilityType' }, { status: 400 })
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
      return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 })
    }
    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const prev = previousPeriod(from, to)
    const [
      curReadings, curBaseline, tiers, history, occupancy, bands,
      prevReadings, prevBaseline, prevOccupancy,
    ] = await Promise.all([
      getReadingsInRange(propertyId, utilityType, from, to),
      getBaselineReading(propertyId, utilityType, from),
      getTiersForProperty(propertyId, utilityType),
      getConsumptionHistory(propertyId, utilityType, 6),
      getOccupancyInRange(propertyId, from, to),
      getKpiBands(propertyId, utilityType),
      getReadingsInRange(propertyId, utilityType, prev.from, prev.to),
      getBaselineReading(propertyId, utilityType, prev.from),
      getOccupancyInRange(propertyId, prev.from, prev.to),
    ])

    const tierInputs: TierInput[] = tiers.map((t) => ({
      tierNumber: t.tierNumber, minUnits: parseFloat(t.minUnits),
      maxUnits: t.maxUnits ? parseFloat(t.maxUnits) : null, ratePerUnit: parseFloat(t.ratePerUnit),
    }))
    const bandInputs = bands.map((b) => ({ minGuests: b.minGuests, targetUnits: parseFloat(b.targetUnits) }))
    const curOcc = new Map(occupancy.map((o) => [o.logDate, { guestCount: o.guestCount, staffCount: o.staffCount }]))
    const prevOcc = new Map(prevOccupancy.map((o) => [o.logDate, { guestCount: o.guestCount, staffCount: o.staffCount }]))

    const dailyRows = buildDailyRows(utilityType, curReadings as ReadingRow[], curBaseline as ReadingRow | null, curOcc, bandInputs)
    const prevRows = buildDailyRows(utilityType, prevReadings as ReadingRow[], prevBaseline as ReadingRow | null, prevOcc, bandInputs)

    const current = aggregatePeriod(dailyRows, curReadings as ReadingRow[], curBaseline as ReadingRow | null, from, to, tierInputs)
    const previousAgg = aggregatePeriod(prevRows, prevReadings as ReadingRow[], prevBaseline as ReadingRow | null, prev.from, prev.to, tierInputs)

    const deltas = {
      consumptionPct: pctDelta(current.totalConsumption, previousAgg.totalConsumption),
      avgPct: pctDelta(current.avgPerDay, previousAgg.avgPerDay),
      costPct: pctDelta(current.totalCost, previousAgg.totalCost),
      kpiDeltaPp: current.kpiPct !== null && previousAgg.kpiPct !== null ? current.kpiPct - previousAgg.kpiPct : null,
    }

    // Daily consumption series (chart): monthly-aggregate when range > 90 days
    const days = rangeDays(from, to)
    let dailyConsumption: { date: string; consumption: number }[]
    if (days > 90) {
      const m = new Map<string, number>()
      for (const r of dailyRows) if (r.total !== null) m.set(monthKey(r.date), (m.get(monthKey(r.date)) ?? 0) + r.total)
      dailyConsumption = [...m.entries()].sort().map(([k, v]) => ({ date: `${k}-01`, consumption: v }))
    } else {
      dailyConsumption = dailyRows.filter((r) => r.total !== null).map((r) => ({ date: r.date, consumption: r.total as number }))
    }

    // Prediction only for the current-month view
    let prediction = null
    if (isThisMonth) {
      const [y, mo] = from.split('-').map(Number)
      const readingsForCalc: { date: string; value: number }[] = []
      if (curBaseline && curBaseline.readingValue !== null) readingsForCalc.push({ date: curBaseline.readingDate, value: parseFloat(curBaseline.readingValue) })
      for (const r of curReadings) if (r.readingValue !== null) readingsForCalc.push({ date: r.readingDate, value: parseFloat(r.readingValue) })
      prediction = predictMonthlyBill(readingsForCalc, tierInputs, y, mo)
    }

    const isAdmin = profile.role === 'admin'
    const safeDailyRows = isAdmin ? dailyRows : dailyRows.map((r) => ({ ...r, target: null, achieved: null, penalty: 'normal' as const }))

    return NextResponse.json({
      range: { from, to, days },
      current: isAdmin ? current : { ...current, kpiPct: null, kpiEvaluatedDays: 0, kpiAchievedDays: 0 },
      previous: isAdmin ? previousAgg : { ...previousAgg, kpiPct: null },
      deltas: isAdmin ? deltas : { ...deltas, kpiDeltaPp: null },
      dailyRows: safeDailyRows,
      dailyConsumption,
      history: history.map((h) => ({ month: h.month, consumption: Number(h.consumption), readingCount: h.readingCount })),
      tiersConfigured: tiers.length > 0,
      prediction,
      kpi: isAdmin
        ? { configured: bands.length > 0, pct: current.kpiPct, evaluatedDays: current.kpiEvaluatedDays, achievedDays: current.kpiAchievedDays }
        : { configured: false, pct: null, evaluatedDays: 0, achievedDays: 0 },
    })
  } catch (error) {
    console.error('GET /api/utilities/summary error:', error)
    return NextResponse.json({ error: 'Failed to compute summary' }, { status: 500 })
  }
}
