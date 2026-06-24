import { eq, and, asc, desc, gte, lte, sql } from 'drizzle-orm'
import { db } from '..'
import {
  utilityRateTiers,
  utilityMeterReadings,
  dailyOccupancy,
  electricityKpiBands,
  utilityKpiTargets,
  electricitySlotConfig,
  profiles,
} from '../schema'

// ---------------------------------------------------------------------------
// Meter Readings
// ---------------------------------------------------------------------------

/**
 * Get all readings for a property/utility type in a given month.
 * Sorted by date ascending.
 */
export async function getReadingsForMonth(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  year: number,
  month: number // 1-indexed
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

  const readings = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        gte(utilityMeterReadings.readingDate, startDate),
        lte(utilityMeterReadings.readingDate, endDate)
      )
    )
    .orderBy(asc(utilityMeterReadings.readingDate))

  // Fetch recorder names
  const recorderIds = readings
    .map((r) => r.recordedBy)
    .filter(Boolean) as string[]

  let recorderMap: Record<string, string> = {}
  if (recorderIds.length > 0) {
    const recorders = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)

    recorderMap = Object.fromEntries(
      recorders.map((p) => [p.id, p.fullName])
    )
  }

  return readings.map((r) => ({
    ...r,
    recorderName: r.recordedBy ? recorderMap[r.recordedBy] ?? null : null,
  }))
}

/**
 * Get the most recent reading for a property/utility type.
 * Used for validation (new readings must be >= this value).
 */
export async function getLatestReading(
  propertyId: string,
  utilityType: 'water' | 'electricity'
) {
  const results = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType)
      )
    )
    .orderBy(desc(utilityMeterReadings.readingDate))
    .limit(1)

  return results[0] ?? null
}

/**
 * Get the last reading from the previous month (used as baseline).
 */
export async function getPreviousMonthLastReading(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  year: number,
  month: number // 1-indexed
) {
  // Calculate previous month
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevEndDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${new Date(prevYear, prevMonth, 0).getDate()}`

  const results = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        lte(utilityMeterReadings.readingDate, prevEndDate)
      )
    )
    .orderBy(desc(utilityMeterReadings.readingDate))
    .limit(1)

  return results[0] ?? null
}

/**
 * Get a single reading by ID.
 */
export async function getReadingById(id: string) {
  const results = await db
    .select()
    .from(utilityMeterReadings)
    .where(eq(utilityMeterReadings.id, id))
    .limit(1)

  return results[0] ?? null
}

/**
 * Upsert a meter reading for a (property, utilityType, date). Water always uses
 * the 'morning' slot (= reading_value). Electricity writes the column for the
 * given slot, leaving the others intact on conflict.
 */
export async function upsertReading(data: {
  propertyId: string
  utilityType: 'water' | 'electricity'
  readingDate: string
  readingValue: string
  slot: 'morning' | 'evening' | 'night'
  note?: string | null
  recordedBy?: string | null
}) {
  const column =
    data.slot === 'morning'
      ? 'readingValue'
      : data.slot === 'evening'
        ? 'eveningReading'
        : 'nightReading'

  const insertValues = {
    propertyId: data.propertyId,
    utilityType: data.utilityType,
    readingDate: data.readingDate,
    readingValue: data.slot === 'morning' ? data.readingValue : '0',
    eveningReading: data.slot === 'evening' ? data.readingValue : null,
    nightReading: data.slot === 'night' ? data.readingValue : null,
    note: data.note ?? null,
    recordedBy: data.recordedBy ?? null,
  }

  const setOnConflict: Record<string, unknown> = {
    [column]: data.readingValue,
    updatedAt: new Date(),
  }
  if (data.note !== undefined) setOnConflict.note = data.note
  if (data.recordedBy !== undefined) setOnConflict.recordedBy = data.recordedBy

  const [row] = await db
    .insert(utilityMeterReadings)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [
        utilityMeterReadings.propertyId,
        utilityMeterReadings.utilityType,
        utilityMeterReadings.readingDate,
      ],
      set: setOnConflict,
    })
    .returning()

  return row
}

/**
 * Update a meter reading.
 */
export async function updateReading(
  id: string,
  data: {
    readingValue?: string
    readingDate?: string
    note?: string | null
  }
) {
  const [updated] = await db
    .update(utilityMeterReadings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(utilityMeterReadings.id, id))
    .returning()

  return updated
}

/**
 * Delete a meter reading.
 */
export async function deleteReading(id: string) {
  const [deleted] = await db
    .delete(utilityMeterReadings)
    .where(eq(utilityMeterReadings.id, id))
    .returning()

  return deleted
}

// ---------------------------------------------------------------------------
// Daily Occupancy
// ---------------------------------------------------------------------------

export async function upsertOccupancy(data: {
  propertyId: string
  logDate: string
  guestCount: number
  staffCount: number
  note?: string | null
  recordedBy?: string | null
}) {
  const [row] = await db
    .insert(dailyOccupancy)
    .values({
      propertyId: data.propertyId,
      logDate: data.logDate,
      guestCount: data.guestCount,
      staffCount: data.staffCount,
      note: data.note ?? null,
      recordedBy: data.recordedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [dailyOccupancy.propertyId, dailyOccupancy.logDate],
      set: {
        guestCount: data.guestCount,
        staffCount: data.staffCount,
        note: data.note ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  return row
}

export async function getOccupancyForMonth(
  propertyId: string,
  year: number,
  month: number
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

  return db
    .select()
    .from(dailyOccupancy)
    .where(
      and(
        eq(dailyOccupancy.propertyId, propertyId),
        gte(dailyOccupancy.logDate, startDate),
        lte(dailyOccupancy.logDate, endDate)
      )
    )
    .orderBy(asc(dailyOccupancy.logDate))
}

// ---------------------------------------------------------------------------
// Rate Tiers
// ---------------------------------------------------------------------------

/**
 * Get all tiers for a property, optionally filtered by utility type.
 * Ordered by utility type then tier number.
 */
export async function getTiersForProperty(
  propertyId: string,
  utilityType?: 'water' | 'electricity'
) {
  const conditions = [eq(utilityRateTiers.propertyId, propertyId)]
  if (utilityType) {
    conditions.push(eq(utilityRateTiers.utilityType, utilityType))
  }

  return db
    .select()
    .from(utilityRateTiers)
    .where(and(...conditions))
    .orderBy(asc(utilityRateTiers.utilityType), asc(utilityRateTiers.tierNumber))
}

/**
 * Replace all tiers for a property + utility type.
 * Deletes existing tiers and inserts new ones in a transaction.
 */
export async function upsertTiers(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  tiers: {
    tierNumber: number
    minUnits: string
    maxUnits: string | null
    ratePerUnit: string
  }[]
) {
  return db.transaction(async (tx) => {
    // Delete existing tiers for this property + type
    await tx
      .delete(utilityRateTiers)
      .where(
        and(
          eq(utilityRateTiers.propertyId, propertyId),
          eq(utilityRateTiers.utilityType, utilityType)
        )
      )

    // Insert new tiers
    if (tiers.length > 0) {
      const values = tiers.map((t) => ({
        propertyId,
        utilityType: utilityType as 'water' | 'electricity',
        tierNumber: t.tierNumber,
        minUnits: t.minUnits,
        maxUnits: t.maxUnits,
        ratePerUnit: t.ratePerUnit,
      }))

      const inserted = await tx
        .insert(utilityRateTiers)
        .values(values)
        .returning()

      return inserted
    }

    return []
  })
}

// ---------------------------------------------------------------------------
// Electricity KPI Bands
// ---------------------------------------------------------------------------

export async function getElectricityBands(propertyId: string) {
  return db
    .select()
    .from(electricityKpiBands)
    .where(eq(electricityKpiBands.propertyId, propertyId))
    .orderBy(asc(electricityKpiBands.minGuests))
}

/**
 * Replace all electricity KPI bands for a property (delete + insert in a tx).
 */
export async function upsertElectricityBands(
  propertyId: string,
  bands: { minGuests: number; targetUnits: string }[]
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(electricityKpiBands)
      .where(eq(electricityKpiBands.propertyId, propertyId))

    if (bands.length > 0) {
      return tx
        .insert(electricityKpiBands)
        .values(
          bands.map((b) => ({
            propertyId,
            minGuests: b.minGuests,
            targetUnits: b.targetUnits,
          }))
        )
        .returning()
    }
    return []
  })
}

// ---------------------------------------------------------------------------
// Water KPI Target (flat)
// ---------------------------------------------------------------------------

export async function getWaterKpiTarget(propertyId: string) {
  const [row] = await db
    .select()
    .from(utilityKpiTargets)
    .where(
      and(
        eq(utilityKpiTargets.propertyId, propertyId),
        eq(utilityKpiTargets.utilityType, 'water')
      )
    )
    .limit(1)
  return row ?? null
}

export async function upsertWaterKpiTarget(
  propertyId: string,
  dailyTargetUnits: string
) {
  const [row] = await db
    .insert(utilityKpiTargets)
    .values({ propertyId, utilityType: 'water', dailyTargetUnits })
    .onConflictDoUpdate({
      target: [utilityKpiTargets.propertyId, utilityKpiTargets.utilityType],
      set: { dailyTargetUnits, updatedAt: new Date() },
    })
    .returning()
  return row
}

// ---------------------------------------------------------------------------
// Electricity Slot Config (org-wide)
// ---------------------------------------------------------------------------

const DEFAULT_SLOT_TIMES = {
  morningTime: '05:30:00',
  eveningTime: '17:30:00',
  nightTime: '22:30:00',
}

export async function getSlotConfig(orgId: string) {
  const [row] = await db
    .select()
    .from(electricitySlotConfig)
    .where(eq(electricitySlotConfig.orgId, orgId))
    .limit(1)
  if (!row) return DEFAULT_SLOT_TIMES
  return {
    morningTime: row.morningTime,
    eveningTime: row.eveningTime,
    nightTime: row.nightTime,
  }
}

export async function upsertSlotConfig(
  orgId: string,
  data: { morningTime: string; eveningTime: string; nightTime: string }
) {
  const [row] = await db
    .insert(electricitySlotConfig)
    .values({ orgId, ...data })
    .onConflictDoUpdate({
      target: [electricitySlotConfig.orgId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning()
  return row
}

// ---------------------------------------------------------------------------
// Aggregation / History
// ---------------------------------------------------------------------------

/**
 * Get monthly consumption totals for the last N months.
 * Consumption = MAX(reading) - MIN(reading) per month.
 * Used for trend charts.
 */
export async function getConsumptionHistory(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  months: number = 6
) {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  return db
    .select({
      month: sql<string>`TO_CHAR(${utilityMeterReadings.readingDate}::date, 'YYYY-MM')`.as('month'),
      consumption: sql<number>`
        MAX(${utilityMeterReadings.readingValue}::numeric) - MIN(${utilityMeterReadings.readingValue}::numeric)
      `.as('consumption'),
      readingCount: sql<number>`COUNT(*)::int`.as('reading_count'),
    })
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        gte(utilityMeterReadings.readingDate, cutoff)
      )
    )
    .groupBy(sql`TO_CHAR(${utilityMeterReadings.readingDate}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${utilityMeterReadings.readingDate}::date, 'YYYY-MM')`)
}
