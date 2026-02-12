import { eq, and, sql, desc, gte, lte } from 'drizzle-orm'
import { db } from '..'
import {
  surveySubmissions,
  surveyResponses,
  surveyQuestions,
  surveyCategories,
  properties,
  profiles,
} from '../schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateRange {
  from: Date
  to: Date
}

export interface PropertyScore {
  propertyId: string
  propertyName: string
  propertyCode: string
  averageScore: number
  submissionCount: number
}

export interface CategoryScore {
  categoryId: string
  categoryName: string
  weight: number
  averageScore: number
  questionCount: number
}

export interface TrendPoint {
  month: string // YYYY-MM
  averageScore: number
  submissionCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateRangeConditions(dateRange?: DateRange) {
  const conditions = []
  if (dateRange?.from) {
    conditions.push(gte(surveySubmissions.visitDate, dateRange.from.toISOString().split('T')[0]))
  }
  if (dateRange?.to) {
    conditions.push(lte(surveySubmissions.visitDate, dateRange.to.toISOString().split('T')[0]))
  }
  return conditions
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get normalized weighted scores for a single property.
 *
 * Normalization: ((score - scale_min) / (scale_max - scale_min)) * 100
 * Weighted average: sum(normalized_score * weight) / sum(weight)
 */
export async function getPropertyScores(
  propertyId: string,
  dateRange?: DateRange
): Promise<PropertyScore | null> {
  const conditions = [
    eq(surveySubmissions.propertyId, propertyId),
    eq(surveySubmissions.status, 'submitted'),
    ...dateRangeConditions(dateRange),
  ]

  const result = await db
    .select({
      propertyId: surveySubmissions.propertyId,
      propertyName: properties.name,
      propertyCode: properties.code,
      averageScore: sql<number>`
        COALESCE(
          SUM(
            (
              (${surveyResponses.score}::numeric - ${surveyQuestions.scaleMin}::numeric)
              / NULLIF(${surveyQuestions.scaleMax}::numeric - ${surveyQuestions.scaleMin}::numeric, 0)
            ) * 100.0 * ${surveyCategories.weight}::numeric
          ) / NULLIF(SUM(${surveyCategories.weight}::numeric), 0),
          0
        )
      `.as('average_score'),
      submissionCount: sql<number>`
        COUNT(DISTINCT ${surveySubmissions.id})
      `.as('submission_count'),
    })
    .from(surveyResponses)
    .innerJoin(
      surveySubmissions,
      eq(surveyResponses.submissionId, surveySubmissions.id)
    )
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .innerJoin(
      surveyQuestions,
      eq(surveyResponses.questionId, surveyQuestions.id)
    )
    .innerJoin(
      surveyCategories,
      eq(surveyQuestions.categoryId, surveyCategories.id)
    )
    .where(and(...conditions))
    .groupBy(
      surveySubmissions.propertyId,
      properties.name,
      properties.code
    )

  if (!result[0]) return null

  return {
    propertyId: result[0].propertyId,
    propertyName: result[0].propertyName,
    propertyCode: result[0].propertyCode,
    averageScore: Number(result[0].averageScore),
    submissionCount: Number(result[0].submissionCount),
  }
}

/**
 * Get overview scores for all properties in an organization.
 */
export async function getAllPropertyScores(
  orgId: string,
  dateRange?: DateRange
): Promise<PropertyScore[]> {
  const conditions = [
    eq(properties.orgId, orgId),
    eq(surveySubmissions.status, 'submitted'),
    ...dateRangeConditions(dateRange),
  ]

  const results = await db
    .select({
      propertyId: surveySubmissions.propertyId,
      propertyName: properties.name,
      propertyCode: properties.code,
      averageScore: sql<number>`
        COALESCE(
          SUM(
            (
              (${surveyResponses.score}::numeric - ${surveyQuestions.scaleMin}::numeric)
              / NULLIF(${surveyQuestions.scaleMax}::numeric - ${surveyQuestions.scaleMin}::numeric, 0)
            ) * 100.0 * ${surveyCategories.weight}::numeric
          ) / NULLIF(SUM(${surveyCategories.weight}::numeric), 0),
          0
        )
      `.as('average_score'),
      submissionCount: sql<number>`
        COUNT(DISTINCT ${surveySubmissions.id})
      `.as('submission_count'),
    })
    .from(surveyResponses)
    .innerJoin(
      surveySubmissions,
      eq(surveyResponses.submissionId, surveySubmissions.id)
    )
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .innerJoin(
      surveyQuestions,
      eq(surveyResponses.questionId, surveyQuestions.id)
    )
    .innerJoin(
      surveyCategories,
      eq(surveyQuestions.categoryId, surveyCategories.id)
    )
    .where(and(...conditions))
    .groupBy(
      surveySubmissions.propertyId,
      properties.name,
      properties.code
    )
    .orderBy(properties.name)

  return results.map((r) => ({
    propertyId: r.propertyId,
    propertyName: r.propertyName,
    propertyCode: r.propertyCode,
    averageScore: Number(r.averageScore),
    submissionCount: Number(r.submissionCount),
  }))
}

/**
 * Get scores broken down by category for a property.
 */
export async function getCategoryBreakdown(
  propertyId: string,
  dateRange?: DateRange
): Promise<CategoryScore[]> {
  const conditions = [
    eq(surveySubmissions.propertyId, propertyId),
    eq(surveySubmissions.status, 'submitted'),
    ...dateRangeConditions(dateRange),
  ]

  const results = await db
    .select({
      categoryId: surveyCategories.id,
      categoryName: surveyCategories.name,
      weight: surveyCategories.weight,
      averageScore: sql<number>`
        COALESCE(
          AVG(
            (
              (${surveyResponses.score}::numeric - ${surveyQuestions.scaleMin}::numeric)
              / NULLIF(${surveyQuestions.scaleMax}::numeric - ${surveyQuestions.scaleMin}::numeric, 0)
            ) * 100.0
          ),
          0
        )
      `.as('average_score'),
      questionCount: sql<number>`
        COUNT(DISTINCT ${surveyQuestions.id})
      `.as('question_count'),
    })
    .from(surveyResponses)
    .innerJoin(
      surveySubmissions,
      eq(surveyResponses.submissionId, surveySubmissions.id)
    )
    .innerJoin(
      surveyQuestions,
      eq(surveyResponses.questionId, surveyQuestions.id)
    )
    .innerJoin(
      surveyCategories,
      eq(surveyQuestions.categoryId, surveyCategories.id)
    )
    .where(and(...conditions))
    .groupBy(
      surveyCategories.id,
      surveyCategories.name,
      surveyCategories.weight
    )
    .orderBy(surveyCategories.sortOrder)

  return results.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    weight: Number(r.weight),
    averageScore: Number(r.averageScore),
    questionCount: Number(r.questionCount),
  }))
}

/**
 * Get monthly trend data for a property.
 */
export async function getTrends(
  propertyId: string,
  months: number = 12
): Promise<TrendPoint[]> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const results = await db
    .select({
      month: sql<string>`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`.as(
        'month'
      ),
      averageScore: sql<number>`
        COALESCE(
          SUM(
            (
              (${surveyResponses.score}::numeric - ${surveyQuestions.scaleMin}::numeric)
              / NULLIF(${surveyQuestions.scaleMax}::numeric - ${surveyQuestions.scaleMin}::numeric, 0)
            ) * 100.0 * ${surveyCategories.weight}::numeric
          ) / NULLIF(SUM(${surveyCategories.weight}::numeric), 0),
          0
        )
      `.as('average_score'),
      submissionCount: sql<number>`
        COUNT(DISTINCT ${surveySubmissions.id})
      `.as('submission_count'),
    })
    .from(surveyResponses)
    .innerJoin(
      surveySubmissions,
      eq(surveyResponses.submissionId, surveySubmissions.id)
    )
    .innerJoin(
      surveyQuestions,
      eq(surveyResponses.questionId, surveyQuestions.id)
    )
    .innerJoin(
      surveyCategories,
      eq(surveyQuestions.categoryId, surveyCategories.id)
    )
    .where(
      and(
        eq(surveySubmissions.propertyId, propertyId),
        eq(surveySubmissions.status, 'submitted'),
        gte(surveySubmissions.visitDate, cutoff)
      )
    )
    .groupBy(
      sql`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`
    )
    .orderBy(
      sql`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`
    )

  return results.map((r) => ({
    month: r.month,
    averageScore: Number(r.averageScore),
    submissionCount: Number(r.submissionCount),
  }))
}

// ---------------------------------------------------------------------------
// Additional helpers for real dashboard data
// ---------------------------------------------------------------------------

/**
 * Get count of submitted surveys for an org in the current month.
 */
export async function getSurveysThisMonth(orgId: string): Promise<number> {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const result = await db
    .select({
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(surveySubmissions)
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(surveySubmissions.status, 'submitted'),
        gte(surveySubmissions.visitDate, monthStart)
      )
    )

  return Number(result[0]?.count ?? 0)
}

/**
 * Get the last survey date per property for an org.
 */
export async function getLastSurveyDates(
  orgId: string
): Promise<Map<string, string>> {
  const results = await db
    .select({
      propertyId: surveySubmissions.propertyId,
      lastDate: sql<string>`MAX(${surveySubmissions.visitDate})`.as('last_date'),
    })
    .from(surveySubmissions)
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(surveySubmissions.status, 'submitted')
      )
    )
    .groupBy(surveySubmissions.propertyId)

  const map = new Map<string, string>()
  for (const r of results) {
    map.set(r.propertyId, r.lastDate)
  }
  return map
}

/**
 * Get monthly sparkline scores (last 6 months) per property for an org.
 * Returns a map: propertyId → number[] of up to 6 monthly scores.
 */
export async function getSparklines(
  orgId: string,
  months: number = 6
): Promise<Map<string, number[]>> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const results = await db
    .select({
      propertyId: surveySubmissions.propertyId,
      month: sql<string>`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`.as('month'),
      averageScore: sql<number>`
        COALESCE(
          SUM(
            (
              (${surveyResponses.score}::numeric - ${surveyQuestions.scaleMin}::numeric)
              / NULLIF(${surveyQuestions.scaleMax}::numeric - ${surveyQuestions.scaleMin}::numeric, 0)
            ) * 100.0 * ${surveyCategories.weight}::numeric
          ) / NULLIF(SUM(${surveyCategories.weight}::numeric), 0),
          0
        )
      `.as('average_score'),
    })
    .from(surveyResponses)
    .innerJoin(surveySubmissions, eq(surveyResponses.submissionId, surveySubmissions.id))
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .innerJoin(surveyQuestions, eq(surveyResponses.questionId, surveyQuestions.id))
    .innerJoin(surveyCategories, eq(surveyQuestions.categoryId, surveyCategories.id))
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(surveySubmissions.status, 'submitted'),
        gte(surveySubmissions.visitDate, cutoff)
      )
    )
    .groupBy(
      surveySubmissions.propertyId,
      sql`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`
    )
    .orderBy(
      surveySubmissions.propertyId,
      sql`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`
    )

  const map = new Map<string, number[]>()
  for (const r of results) {
    const arr = map.get(r.propertyId) ?? []
    arr.push(Math.round(Number(r.averageScore) * 10) / 10)
    map.set(r.propertyId, arr)
  }
  return map
}

export interface NoteRow {
  id: string
  question: string
  score: number
  note: string
  date: string
  surveyor: string
}

/**
 * Get recent survey notes (responses with non-empty note) for a property.
 * Only from submitted surveys.
 */
export async function getRecentNotes(
  propertyId: string,
  limit: number = 20
): Promise<NoteRow[]> {
  const results = await db
    .select({
      id: surveyResponses.id,
      question: surveyQuestions.text,
      score: surveyResponses.score,
      note: surveyResponses.note,
      date: surveySubmissions.visitDate,
      surveyor: profiles.fullName,
    })
    .from(surveyResponses)
    .innerJoin(surveySubmissions, eq(surveyResponses.submissionId, surveySubmissions.id))
    .innerJoin(surveyQuestions, eq(surveyResponses.questionId, surveyQuestions.id))
    .innerJoin(profiles, eq(surveySubmissions.submittedBy, profiles.id))
    .where(
      and(
        eq(surveySubmissions.propertyId, propertyId),
        eq(surveySubmissions.status, 'submitted'),
        sql`${surveyResponses.note} IS NOT NULL AND ${surveyResponses.note} != ''`
      )
    )
    .orderBy(desc(surveySubmissions.visitDate))
    .limit(limit)

  return results.map((r) => ({
    id: r.id,
    question: r.question,
    score: r.score,
    note: r.note!,
    date: r.date,
    surveyor: r.surveyor,
  }))
}

/**
 * Get monthly trend data across ALL properties in an org (for overview chart).
 * Returns { date (Mon YYYY), [propertyCode]: score }
 */
export async function getOrgTrends(
  orgId: string,
  months: number = 6
): Promise<{ date: string; [key: string]: string | number }[]> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const results = await db
    .select({
      propertyCode: properties.code,
      month: sql<string>`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`.as('month'),
      averageScore: sql<number>`
        COALESCE(
          SUM(
            (
              (${surveyResponses.score}::numeric - ${surveyQuestions.scaleMin}::numeric)
              / NULLIF(${surveyQuestions.scaleMax}::numeric - ${surveyQuestions.scaleMin}::numeric, 0)
            ) * 100.0 * ${surveyCategories.weight}::numeric
          ) / NULLIF(SUM(${surveyCategories.weight}::numeric), 0),
          0
        )
      `.as('average_score'),
    })
    .from(surveyResponses)
    .innerJoin(surveySubmissions, eq(surveyResponses.submissionId, surveySubmissions.id))
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .innerJoin(surveyQuestions, eq(surveyResponses.questionId, surveyQuestions.id))
    .innerJoin(surveyCategories, eq(surveyQuestions.categoryId, surveyCategories.id))
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(surveySubmissions.status, 'submitted'),
        gte(surveySubmissions.visitDate, cutoff)
      )
    )
    .groupBy(
      properties.code,
      sql`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`
    )
    .orderBy(sql`TO_CHAR(${surveySubmissions.visitDate}::date, 'YYYY-MM')`)

  // Pivot: group by month, embed property codes as keys
  type TrendRow = { date: string; [key: string]: string | number }
  const monthMap = new Map<string, TrendRow>()
  for (const r of results) {
    if (!monthMap.has(r.month)) {
      // Format month label: "Jan 2026"
      const [y, m] = r.month.split('-')
      const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
      monthMap.set(r.month, { date: label })
    }
    const point = monthMap.get(r.month)!
    point[r.propertyCode.toLowerCase()] = Math.round(Number(r.averageScore) * 10) / 10
  }

  return Array.from(monthMap.values())
}
