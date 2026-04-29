import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  otaReviewSources,
  otaReviews,
  otaSyntheses,
  properties,
} from '@/lib/db/schema'
import type {
  AspectScores,
  Bullet,
  RepetitiveIssue,
  SynthesisStatus,
} from '@/lib/ota/types'

// ---------- ota_review_sources ----------

export async function getActiveSources() {
  return db
    .select({
      id: otaReviewSources.id,
      propertyId: otaReviewSources.propertyId,
      propertyName: properties.name,
      source: otaReviewSources.source,
      externalId: otaReviewSources.externalId,
    })
    .from(otaReviewSources)
    .innerJoin(properties, eq(otaReviewSources.propertyId, properties.id))
    .where(eq(otaReviewSources.isActive, true))
}

export async function getSourceForProperty(propertyId: string, source: 'google' = 'google') {
  const rows = await db
    .select()
    .from(otaReviewSources)
    .where(and(eq(otaReviewSources.propertyId, propertyId), eq(otaReviewSources.source, source)))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertSource(args: {
  propertyId: string
  source: 'google'
  externalId: string
}) {
  const existing = await getSourceForProperty(args.propertyId, args.source)
  if (!existing) {
    const [row] = await db
      .insert(otaReviewSources)
      .values({ propertyId: args.propertyId, source: args.source, externalId: args.externalId })
      .returning()
    return row
  }
  const [row] = await db
    .update(otaReviewSources)
    .set({ externalId: args.externalId, isActive: true, updatedAt: new Date() })
    .where(eq(otaReviewSources.id, existing.id))
    .returning()
  return row
}

export async function deactivateSource(propertyId: string, source: 'google' = 'google') {
  await db
    .update(otaReviewSources)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(otaReviewSources.propertyId, propertyId), eq(otaReviewSources.source, source)))
}

export async function recordFetchSuccess(sourceId: string) {
  await db
    .update(otaReviewSources)
    .set({ lastFetchedAt: new Date(), lastFetchError: null, updatedAt: new Date() })
    .where(eq(otaReviewSources.id, sourceId))
}

export async function recordFetchError(sourceId: string, message: string) {
  await db
    .update(otaReviewSources)
    .set({ lastFetchError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(otaReviewSources.id, sourceId))
}

// ---------- ota_reviews ----------

export async function insertReviewIfNew(row: typeof otaReviews.$inferInsert) {
  await db.insert(otaReviews).values(row).onConflictDoNothing({
    target: [otaReviews.sourceId, otaReviews.externalReviewId],
  })
}

export async function getReviewsInWindow(propertyId: string, windowStart: Date) {
  return db
    .select()
    .from(otaReviews)
    .where(and(eq(otaReviews.propertyId, propertyId), gte(otaReviews.reviewedAt, windowStart)))
    .orderBy(desc(otaReviews.reviewedAt))
}

export async function getRecentReviews(propertyId: string, limit = 25) {
  return db
    .select()
    .from(otaReviews)
    .where(eq(otaReviews.propertyId, propertyId))
    .orderBy(desc(otaReviews.reviewedAt))
    .limit(limit)
}

export async function getReviewsThisMonth(orgId: string): Promise<number> {
  const since = new Date()
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)
  const result = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otaReviews)
    .innerJoin(properties, eq(otaReviews.propertyId, properties.id))
    .where(and(eq(properties.orgId, orgId), gte(otaReviews.reviewedAt, since)))
  return result[0]?.n ?? 0
}

// ---------- ota_syntheses ----------

export interface SynthesisRow {
  id: string
  propertyId: string
  generatedAt: Date
  windowStart: Date
  windowEnd: Date
  reviewsAnalyzed: number
  avgRating: string | null
  aspectScores: AspectScores
  strengths: Bullet[]
  weaknesses: Bullet[]
  repetitiveIssues: RepetitiveIssue[]
  status: SynthesisStatus
  errorMessage: string | null
  modelUsed: string
  promptVersion: string
  costUsd: string | null
}

export async function getLatestSynthesis(propertyId: string): Promise<SynthesisRow | null> {
  const rows = await db
    .select()
    .from(otaSyntheses)
    .where(eq(otaSyntheses.propertyId, propertyId))
    .orderBy(desc(otaSyntheses.generatedAt))
    .limit(1)
  return (rows[0] as SynthesisRow | undefined) ?? null
}

export async function getSynthesisForTrend(args: {
  propertyId: string
  promptVersion: string
  before: Date
}): Promise<SynthesisRow | null> {
  const rows = await db
    .select()
    .from(otaSyntheses)
    .where(
      and(
        eq(otaSyntheses.propertyId, args.propertyId),
        eq(otaSyntheses.promptVersion, args.promptVersion),
        eq(otaSyntheses.status, 'ok'),
        lt(otaSyntheses.generatedAt, args.before)
      )
    )
    .orderBy(desc(otaSyntheses.generatedAt))
    .limit(1)
  return (rows[0] as SynthesisRow | undefined) ?? null
}

export async function insertSynthesis(row: typeof otaSyntheses.$inferInsert) {
  const [r] = await db.insert(otaSyntheses).values(row).returning()
  return r
}

export async function pruneOldSyntheses(propertyId: string, olderThan: Date) {
  await db
    .delete(otaSyntheses)
    .where(and(eq(otaSyntheses.propertyId, propertyId), lt(otaSyntheses.generatedAt, olderThan)))
}

export async function getOrgPortfolioSyntheses(orgId: string): Promise<
  Array<{ property: { id: string; name: string }; synthesis: SynthesisRow | null }>
> {
  const props = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.isActive, true)))
  const out: Array<{ property: { id: string; name: string }; synthesis: SynthesisRow | null }> = []
  for (const p of props) {
    const synth = await getLatestSynthesis(p.id)
    out.push({ property: p, synthesis: synth })
  }
  return out
}
