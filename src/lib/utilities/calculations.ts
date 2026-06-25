/**
 * Tier input for cost calculations.
 */
export interface TierInput {
  tierNumber: number
  minUnits: number
  maxUnits: number | null // null = unlimited (last tier)
  ratePerUnit: number
}

/**
 * Breakdown of cost per tier.
 */
export interface TierBreakdown {
  tierNumber: number
  unitsInTier: number
  ratePerUnit: number
  cost: number
}

/**
 * Result of a tiered cost calculation.
 */
export interface TieredCostResult {
  totalCost: number
  totalConsumption: number
  breakdown: TierBreakdown[]
}

/**
 * Result of a monthly prediction.
 */
export interface MonthlyPrediction {
  actualConsumption: number
  actualCost: number
  predictedConsumption: number
  predictedCost: number
  avgDailyConsumption: number
  daysElapsed: number
  daysInMonth: number
  costBreakdown: TierBreakdown[]
  predictedBreakdown: TierBreakdown[]
}

/**
 * Calculate cost using progressive/marginal tiered pricing (like tax brackets).
 * Each unit of consumption is priced at the rate of the tier it falls into.
 *
 * Example: consumption = 75, tiers = [0-30 @ $5, 31-60 @ $10, 61-90 @ $15]
 *   Tier 1: 30 * $5  = $150
 *   Tier 2: 30 * $10 = $300
 *   Tier 3: 15 * $15 = $225
 *   Total: $675
 *
 * @param consumption - Total units consumed
 * @param tiers - Array of tier definitions, sorted by tierNumber ascending
 * @returns Total cost and per-tier breakdown
 */
export function calculateTieredCost(
  consumption: number,
  tiers: TierInput[]
): TieredCostResult {
  if (consumption <= 0 || tiers.length === 0) {
    return { totalCost: 0, totalConsumption: consumption, breakdown: [] }
  }

  const sorted = [...tiers].sort((a, b) => a.tierNumber - b.tierNumber)
  let remaining = consumption
  const breakdown: TierBreakdown[] = []

  for (const tier of sorted) {
    if (remaining <= 0) break

    const tierWidth = tier.maxUnits !== null
      ? tier.maxUnits - tier.minUnits
      : remaining // Last tier: uncapped

    const unitsInTier = Math.min(remaining, tierWidth)
    const cost = unitsInTier * tier.ratePerUnit

    breakdown.push({
      tierNumber: tier.tierNumber,
      unitsInTier,
      ratePerUnit: tier.ratePerUnit,
      cost,
    })

    remaining -= unitsInTier
  }

  const totalCost = breakdown.reduce((sum, b) => sum + b.cost, 0)
  return { totalCost, totalConsumption: consumption, breakdown }
}

/**
 * Predict the full month's bill based on readings entered so far.
 *
 * Algorithm:
 * 1. Actual consumption = last reading - first reading of the period
 * 2. Days elapsed = date of last reading - date of first reading
 * 3. Average daily consumption = actual consumption / days elapsed
 * 4. Predicted monthly consumption = avg daily * total days in month
 * 5. Apply tiered rates to both actual and predicted consumption
 *
 * @param readings - Array of { date, value } sorted by date ascending
 * @param tiers - Tier definitions for cost calculation
 * @param year - Year of the month to predict
 * @param month - Month to predict (1-indexed: 1 = January)
 * @returns Prediction with actual vs predicted consumption and costs
 */
export function predictMonthlyBill(
  readings: { date: string; value: number }[],
  tiers: TierInput[],
  year: number,
  month: number // 1-indexed
): MonthlyPrediction {
  const daysInMonth = new Date(year, month, 0).getDate() // month is 1-indexed, so (year, month, 0) gives last day of that month

  const empty: MonthlyPrediction = {
    actualConsumption: 0,
    actualCost: 0,
    predictedConsumption: 0,
    predictedCost: 0,
    avgDailyConsumption: 0,
    daysElapsed: 0,
    daysInMonth,
    costBreakdown: [],
    predictedBreakdown: [],
  }

  if (readings.length < 2) return empty

  const firstReading = readings[0]
  const lastReading = readings[readings.length - 1]
  const actualConsumption = lastReading.value - firstReading.value

  if (actualConsumption < 0) return empty // Invalid: meter went backwards

  const firstDate = new Date(firstReading.date)
  const lastDate = new Date(lastReading.date)
  const daysElapsed = Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysElapsed <= 0) return empty

  const avgDailyConsumption = actualConsumption / daysElapsed
  const predictedConsumption = avgDailyConsumption * daysInMonth

  const actualResult = calculateTieredCost(actualConsumption, tiers)
  const predictedResult = calculateTieredCost(predictedConsumption, tiers)

  return {
    actualConsumption,
    actualCost: actualResult.totalCost,
    predictedConsumption,
    predictedCost: predictedResult.totalCost,
    avgDailyConsumption,
    daysElapsed,
    daysInMonth,
    costBreakdown: actualResult.breakdown,
    predictedBreakdown: predictedResult.breakdown,
  }
}

/**
 * Calculate daily consumption from consecutive meter readings.
 * Returns an array of { date, consumption } pairs.
 *
 * @param readings - Array of { date, value } sorted by date ascending
 * @returns Array of daily consumption values
 */
export function calculateDailyConsumption(
  readings: { date: string; value: number }[]
): { date: string; consumption: number }[] {
  if (readings.length < 2) return []

  return readings.slice(1).map((reading, i) => ({
    date: reading.date,
    consumption: reading.value - readings[i].value,
  }))
}

/**
 * One day's electricity meter readings at the three slots.
 * `morning` is the canonical reading_value; evening/night are the later slots.
 * Rows must be sorted by date ascending.
 */
export interface SlotRow {
  date: string
  morning: number | null
  evening: number | null
  night: number | null
}

export interface ElectricityDayBreakdown {
  date: string
  day: number | null      // evening - morning
  peak: number | null     // night - evening
  offPeak: number | null  // next day's morning - night
  total: number | null    // next day's morning - morning (= day + peak + offPeak)
  pending: boolean        // true when total can't be finalised yet (no next morning)
}

export interface KpiBandInput {
  minGuests: number
  targetUnits: number
}

/**
 * Compute Day / Peak / Off-Peak / Total per day from consecutive slot rows.
 * Off-Peak and Total for a day need the NEXT day's morning reading; until that
 * exists the day is `pending` with null total.
 *
 * A bucket is null when either endpoint reading is missing or the delta is
 * negative (meter reset / bad data) — callers render these as "—".
 */
export function computeElectricityBreakdown(rows: SlotRow[]): ElectricityDayBreakdown[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

  return sorted.map((row, i) => {
    const next = i < sorted.length - 1 ? sorted[i + 1] : null
    const nonNeg = (v: number) => (v >= 0 ? v : null)

    const day =
      row.evening !== null && row.morning !== null
        ? nonNeg(row.evening - row.morning)
        : null
    const peak =
      row.night !== null && row.evening !== null
        ? nonNeg(row.night - row.evening)
        : null
    const offPeak =
      next && next.morning !== null && row.night !== null
        ? nonNeg(next.morning - row.night)
        : null
    const total =
      next && next.morning !== null && row.morning !== null
        ? nonNeg(next.morning - row.morning)
        : null

    return {
      date: row.date,
      day,
      peak,
      offPeak,
      total,
      pending: total === null,
    }
  })
}

/**
 * Resolve the banded daily target for a guest count: the target of the band
 * with the largest minGuests <= guestCount. Returns null if guestCount is null
 * or no band qualifies / none configured.
 */
export function resolveBandTarget(
  guestCount: number | null,
  bands: KpiBandInput[]
): number | null {
  if (guestCount === null || bands.length === 0) return null
  const eligible = bands
    .filter((b) => b.minGuests <= guestCount)
    .sort((a, b) => b.minGuests - a.minGuests)
  return eligible.length > 0 ? eligible[0].targetUnits : null
}

/**
 * Compute KPI achievement over a set of days.
 * - A day with `missed: true` is forced to count as evaluated AND not-achieved
 *   (the missed-entry penalty), regardless of total/target.
 * - Otherwise a day is evaluated only when both total and target are non-null;
 *   achieved when total <= target.
 * Returns a null pct when no days are evaluable.
 */
export function computeKpiAchievement(
  days: { total: number | null; target: number | null; missed?: boolean }[]
): { evaluatedDays: number; achievedDays: number; pct: number | null } {
  let evaluated = 0
  let achieved = 0
  for (const d of days) {
    if (d.missed) {
      evaluated++ // counts, never achieved
      continue
    }
    if (d.total !== null && d.target !== null) {
      evaluated++
      if (d.total <= d.target) achieved++
    }
  }
  return {
    evaluatedDays: evaluated,
    achievedDays: achieved,
    pct: evaluated > 0 ? (achieved / evaluated) * 100 : null,
  }
}

export type SlotStatus = 'manual' | 'autofilled' | 'edited' | null

/**
 * Day-level penalty state derived from the three slot statuses.
 * 'missed' if ANY slot was auto-filled; else 'edited' if any was an admin late
 * edit; else 'normal'.
 */
export function dayPenaltyState(statuses: {
  morning: SlotStatus
  evening: SlotStatus
  night: SlotStatus
}): 'missed' | 'edited' | 'normal' {
  const vals = [statuses.morning, statuses.evening, statuses.night]
  if (vals.includes('autofilled')) return 'missed'
  if (vals.includes('edited')) return 'edited'
  return 'normal'
}

/**
 * Percentage change from previous to current. Null when previous is null or 0
 * (no meaningful base to compare against).
 */
export function pctDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * Total cost over a range = sum of each calendar month's tiered cost. Tiers
 * reset monthly, so each month's consumption is priced independently.
 */
export function calculateRangeCost(monthlyConsumptions: number[], tiers: TierInput[]): number {
  return monthlyConsumptions.reduce((sum, c) => sum + calculateTieredCost(c, tiers).totalCost, 0)
}
