import { eq, and, asc, gte, lte, sql } from 'drizzle-orm'
import { db } from '..'
import { wasteLogs, profiles } from '../schema'
import type { WasteLog } from '../schema'

function monthBounds(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
  return { startDate, endDate }
}

export interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

/** All daily logs for a property in a given month, ascending by date, with recorder name. */
export async function getWasteLogsForMonth(
  propertyId: string,
  year: number,
  month: number // 1-indexed
): Promise<(WasteLog & { recorderName: string | null })[]> {
  const { startDate, endDate } = monthBounds(year, month)

  const logs = await db
    .select()
    .from(wasteLogs)
    .where(
      and(
        eq(wasteLogs.propertyId, propertyId),
        gte(wasteLogs.logDate, startDate),
        lte(wasteLogs.logDate, endDate)
      )
    )
    .orderBy(asc(wasteLogs.logDate))

  const recorderIds = logs.map((l) => l.recordedBy).filter(Boolean) as string[]
  let recorderMap: Record<string, string> = {}
  if (recorderIds.length > 0) {
    const recorders = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
    recorderMap = Object.fromEntries(recorders.map((p) => [p.id, p.fullName]))
  }

  return logs.map((l) => ({
    ...l,
    recorderName: l.recordedBy ? recorderMap[l.recordedBy] ?? null : null,
  }))
}

/** Single log by id. */
export async function getWasteLogById(id: string): Promise<WasteLog | null> {
  const results = await db.select().from(wasteLogs).where(eq(wasteLogs.id, id)).limit(1)
  return results[0] ?? null
}

/** Create a daily waste log. */
export async function createWasteLog(data: {
  propertyId: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note?: string | null
  recordedBy?: string | null
}): Promise<WasteLog> {
  const [inserted] = await db.insert(wasteLogs).values(data).returning()
  return inserted
}

/** Update a daily waste log. */
export async function updateWasteLog(
  id: string,
  data: {
    logDate?: string
    paperKg?: string
    glassKg?: string
    plasticKg?: string
    foodKg?: string
    metalKg?: string
    electronicKg?: string
    note?: string | null
  }
): Promise<WasteLog> {
  const [updated] = await db
    .update(wasteLogs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(wasteLogs.id, id))
    .returning()
  return updated
}

/** Delete a daily waste log. */
export async function deleteWasteLog(id: string): Promise<WasteLog> {
  const [deleted] = await db.delete(wasteLogs).where(eq(wasteLogs.id, id)).returning()
  return deleted
}

/** Per-category totals + grand total for a property/month. */
export async function getWasteSummaryForMonth(
  propertyId: string,
  year: number,
  month: number
): Promise<WasteTotals> {
  const { startDate, endDate } = monthBounds(year, month)

  const [row] = await db
    .select({
      paperKg: sql<number>`COALESCE(SUM(${wasteLogs.paperKg}), 0)::float`,
      glassKg: sql<number>`COALESCE(SUM(${wasteLogs.glassKg}), 0)::float`,
      plasticKg: sql<number>`COALESCE(SUM(${wasteLogs.plasticKg}), 0)::float`,
      foodKg: sql<number>`COALESCE(SUM(${wasteLogs.foodKg}), 0)::float`,
      metalKg: sql<number>`COALESCE(SUM(${wasteLogs.metalKg}), 0)::float`,
      electronicKg: sql<number>`COALESCE(SUM(${wasteLogs.electronicKg}), 0)::float`,
    })
    .from(wasteLogs)
    .where(
      and(
        eq(wasteLogs.propertyId, propertyId),
        gte(wasteLogs.logDate, startDate),
        lte(wasteLogs.logDate, endDate)
      )
    )

  const totals = {
    paperKg: Number(row?.paperKg ?? 0),
    glassKg: Number(row?.glassKg ?? 0),
    plasticKg: Number(row?.plasticKg ?? 0),
    foodKg: Number(row?.foodKg ?? 0),
    metalKg: Number(row?.metalKg ?? 0),
    electronicKg: Number(row?.electronicKg ?? 0),
  }
  const total =
    totals.paperKg +
    totals.glassKg +
    totals.plasticKg +
    totals.foodKg +
    totals.metalKg +
    totals.electronicKg

  return { ...totals, total }
}

/** Monthly per-category totals for the last N months (for trend charts). */
export async function getWasteHistory(
  propertyId: string,
  months: number = 6
): Promise<({ month: string } & WasteTotals)[]> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const rows = await db
    .select({
      month: sql<string>`TO_CHAR(${wasteLogs.logDate}::date, 'YYYY-MM')`.as('month'),
      paperKg: sql<number>`COALESCE(SUM(${wasteLogs.paperKg}), 0)::float`,
      glassKg: sql<number>`COALESCE(SUM(${wasteLogs.glassKg}), 0)::float`,
      plasticKg: sql<number>`COALESCE(SUM(${wasteLogs.plasticKg}), 0)::float`,
      foodKg: sql<number>`COALESCE(SUM(${wasteLogs.foodKg}), 0)::float`,
      metalKg: sql<number>`COALESCE(SUM(${wasteLogs.metalKg}), 0)::float`,
      electronicKg: sql<number>`COALESCE(SUM(${wasteLogs.electronicKg}), 0)::float`,
    })
    .from(wasteLogs)
    .where(and(eq(wasteLogs.propertyId, propertyId), gte(wasteLogs.logDate, cutoff)))
    .groupBy(sql`TO_CHAR(${wasteLogs.logDate}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${wasteLogs.logDate}::date, 'YYYY-MM')`)

  return rows.map((r) => {
    const totals = {
      paperKg: Number(r.paperKg),
      glassKg: Number(r.glassKg),
      plasticKg: Number(r.plasticKg),
      foodKg: Number(r.foodKg),
      metalKg: Number(r.metalKg),
      electronicKg: Number(r.electronicKg),
    }
    const total =
      totals.paperKg +
      totals.glassKg +
      totals.plasticKg +
      totals.foodKg +
      totals.metalKg +
      totals.electronicKg
    return { month: r.month, ...totals, total }
  })
}
