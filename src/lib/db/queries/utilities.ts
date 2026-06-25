import { eq, and, asc, desc, gte, lte, lt, sql } from 'drizzle-orm'
import { db } from '..'
import {
  utilityRateTiers,
  utilityMeterReadings,
  dailyOccupancy,
  utilityKpiBands,
  electricitySlotConfig,
  profiles,
  properties,
} from '../schema'

// ---------------------------------------------------------------------------
// Meter Readings
// ---------------------------------------------------------------------------

/** Readings for a property/utility in [from, to] inclusive, ascending, with recorder names. */
export async function getReadingsInRange(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  from: string,
  to: string
) {
  const readings = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        gte(utilityMeterReadings.readingDate, from),
        lte(utilityMeterReadings.readingDate, to)
      )
    )
    .orderBy(asc(utilityMeterReadings.readingDate))

  const recorderIds = readings.map((r) => r.recordedBy).filter(Boolean) as string[]
  let recorderMap: Record<string, string> = {}
  if (recorderIds.length > 0) {
    const recorders = await db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles)
    recorderMap = Object.fromEntries(recorders.map((p) => [p.id, p.fullName]))
  }
  return readings.map((r) => ({
    ...r,
    recorderName: r.recordedBy ? recorderMap[r.recordedBy] ?? null : null,
  }))
}

/** The latest reading strictly before `before` (the cumulative baseline). */
export async function getBaselineReading(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  before: string
) {
  const [row] = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        lt(utilityMeterReadings.readingDate, before)
      )
    )
    .orderBy(desc(utilityMeterReadings.readingDate))
    .limit(1)
  return row ?? null
}

/** Occupancy rows for a property in [from, to] inclusive. */
export async function getOccupancyInRange(propertyId: string, from: string, to: string) {
  return db
    .select()
    .from(dailyOccupancy)
    .where(
      and(
        eq(dailyOccupancy.propertyId, propertyId),
        gte(dailyOccupancy.logDate, from),
        lte(dailyOccupancy.logDate, to)
      )
    )
    .orderBy(asc(dailyOccupancy.logDate))
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
 * The optional `status` defaults to 'manual'; pass 'autofilled' or 'edited' for
 * cron-generated or user-corrected rows respectively.
 */
export async function upsertReading(data: {
  propertyId: string
  utilityType: 'water' | 'electricity'
  readingDate: string
  readingValue: string | null
  slot: 'morning' | 'evening' | 'night'
  status?: 'manual' | 'autofilled' | 'edited'
  note?: string | null
  recordedBy?: string | null
}) {
  const valueColumn =
    data.slot === 'morning' ? 'readingValue' : data.slot === 'evening' ? 'eveningReading' : 'nightReading'
  const statusColumn =
    data.slot === 'morning' ? 'morningStatus' : data.slot === 'evening' ? 'eveningStatus' : 'nightStatus'
  const status = data.status ?? 'manual'

  const insertValues = {
    propertyId: data.propertyId,
    utilityType: data.utilityType,
    readingDate: data.readingDate,
    readingValue: data.slot === 'morning' ? data.readingValue : null,
    eveningReading: data.slot === 'evening' ? data.readingValue : null,
    nightReading: data.slot === 'night' ? data.readingValue : null,
    morningStatus: data.slot === 'morning' ? status : null,
    eveningStatus: data.slot === 'evening' ? status : null,
    nightStatus: data.slot === 'night' ? status : null,
    note: data.note ?? null,
    recordedBy: data.recordedBy ?? null,
  }

  const setOnConflict: Record<string, unknown> = {
    [valueColumn]: data.readingValue,
    [statusColumn]: status,
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
  const occSet: Record<string, unknown> = {
    guestCount: data.guestCount,
    staffCount: data.staffCount,
    updatedAt: new Date(),
  }
  if (data.note !== undefined) occSet.note = data.note

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
      set: occSet,
    })
    .returning()

  return row
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
// KPI Bands (parameterized by utility type)
// ---------------------------------------------------------------------------

export async function getKpiBands(propertyId: string, utilityType: 'water' | 'electricity') {
  return db
    .select()
    .from(utilityKpiBands)
    .where(and(eq(utilityKpiBands.propertyId, propertyId), eq(utilityKpiBands.utilityType, utilityType)))
    .orderBy(asc(utilityKpiBands.minGuests))
}

/** Replace all KPI bands for a property + utility (delete + insert in a tx). */
export async function upsertKpiBands(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  bands: { minGuests: number; targetUnits: string }[]
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(utilityKpiBands)
      .where(and(eq(utilityKpiBands.propertyId, propertyId), eq(utilityKpiBands.utilityType, utilityType)))

    if (bands.length > 0) {
      return tx
        .insert(utilityKpiBands)
        .values(bands.map((b) => ({ propertyId, utilityType, minGuests: b.minGuests, targetUnits: b.targetUnits })))
        .returning()
    }
    return []
  })
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

/** Electricity readings for a property on/after a date, ascending. */
export async function getReadingsSince(propertyId: string, sinceDate: string) {
  return db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, 'electricity'),
        gte(utilityMeterReadings.readingDate, sinceDate)
      )
    )
    .orderBy(asc(utilityMeterReadings.readingDate))
}

/** All properties with their org id (for the autofill cron sweep). */
export async function getAllPropertiesWithOrg() {
  return db
    .select({ id: properties.id, orgId: properties.orgId })
    .from(properties)
}
