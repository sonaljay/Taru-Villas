import { fetchPlaceReviews } from './google-places'
import { synthesizeReviews, PROMPT_VERSION, SYNTHESIS_MODEL } from './synthesis'
import { hashReviewId } from './helpers'
import type { SynthesisOutput } from './types'
import {
  getSourceForProperty,
  insertReviewIfNew,
  recordFetchSuccess,
  recordFetchError,
  getReviewsInWindow,
  insertSynthesis,
  pruneOldSyntheses,
} from '@/lib/db/queries/ota'
import { db } from '@/lib/db'
import { properties } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const WINDOW_DAYS = 90
const PRUNE_AFTER_DAYS = 180
const MIN_REVIEWS_FOR_SYNTHESIS = 3

export interface SyncResult {
  propertyId: string
  fetched: number
  inserted: number
  synthesisStatus: 'ok' | 'insufficient_data' | 'error' | 'skipped'
  error?: string
}

/**
 * End-to-end sync for one property:
 * 1. Fetch from Google → upsert into ota_reviews
 * 2. Pull last 90 days from DB → call Claude synthesis → insert ota_syntheses
 * 3. Prune syntheses older than 180 days
 *
 * Errors are recorded to the source row (last_fetch_error) or as an 'error'
 * synthesis row, never thrown out of this function — the caller (cron) loops
 * across properties and one failure must not abort the run.
 */
export async function syncProperty(propertyId: string): Promise<SyncResult> {
  const result: SyncResult = {
    propertyId,
    fetched: 0,
    inserted: 0,
    synthesisStatus: 'skipped',
  }

  // 1. Resolve property + source
  const [property] = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1)
  if (!property) {
    return { ...result, synthesisStatus: 'error', error: 'property not found' }
  }

  const source = await getSourceForProperty(propertyId, 'google')
  if (!source || !source.isActive) {
    return { ...result, error: 'no active google source' }
  }

  // 2. Fetch from Google
  let fetched: Awaited<ReturnType<typeof fetchPlaceReviews>>
  try {
    fetched = await fetchPlaceReviews(source.externalId)
    await recordFetchSuccess(source.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordFetchError(source.id, msg)
    return { ...result, synthesisStatus: 'error', error: msg }
  }
  result.fetched = fetched.reviews.length

  // 3. Dedupe-insert
  for (const r of fetched.reviews) {
    const externalReviewId = hashReviewId({
      authorName: r.authorName,
      reviewedAt: r.reviewedAt,
      text: r.text,
    })
    try {
      await insertReviewIfNew({
        sourceId: source.id,
        propertyId: source.propertyId,
        externalReviewId,
        authorName: r.authorName,
        rating: r.rating,
        text: r.text,
        language: r.language,
        reviewedAt: r.reviewedAt,
        rawPayload: r.raw as Record<string, unknown>,
      })
      result.inserted += 1
    } catch (e) {
      console.error('[ota.sync] insert failed', e)
    }
  }

  // 4. Synthesize over 90-day window
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 86400_000)
  const reviewsInWindow = await getReviewsInWindow(propertyId, windowStart)

  if (reviewsInWindow.length < MIN_REVIEWS_FOR_SYNTHESIS) {
    await insertSynthesis({
      propertyId,
      windowStart,
      windowEnd,
      reviewsAnalyzed: reviewsInWindow.length,
      avgRating: null,
      status: 'insufficient_data',
      modelUsed: SYNTHESIS_MODEL,
      promptVersion: PROMPT_VERSION,
    })
    result.synthesisStatus = 'insufficient_data'
    return result
  }

  const avgRating =
    reviewsInWindow.reduce((s, r) => s + r.rating, 0) / reviewsInWindow.length

  let output: SynthesisOutput
  let costUsd = 0
  try {
    const synth = await synthesizeReviews({
      propertyName: property.name,
      windowStart,
      windowEnd,
      reviews: reviewsInWindow.map((r) => ({
        reviewedAt: r.reviewedAt,
        rating: r.rating,
        text: r.text ?? '',
      })),
    })
    output = synth.output
    costUsd = synth.costUsd
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await insertSynthesis({
      propertyId,
      windowStart,
      windowEnd,
      reviewsAnalyzed: reviewsInWindow.length,
      avgRating: avgRating.toFixed(2),
      status: 'error',
      errorMessage: msg.slice(0, 1000),
      modelUsed: SYNTHESIS_MODEL,
      promptVersion: PROMPT_VERSION,
    })
    result.synthesisStatus = 'error'
    result.error = msg
    return result
  }

  await insertSynthesis({
    propertyId,
    windowStart,
    windowEnd,
    reviewsAnalyzed: reviewsInWindow.length,
    avgRating: avgRating.toFixed(2),
    aspectScores: output.aspect_scores,
    strengths: output.strengths,
    weaknesses: output.weaknesses,
    repetitiveIssues: output.repetitive_issues,
    status: 'ok',
    modelUsed: SYNTHESIS_MODEL,
    promptVersion: PROMPT_VERSION,
    costUsd: costUsd.toFixed(4),
  })

  // 5. Prune old syntheses
  const pruneCutoff = new Date(Date.now() - PRUNE_AFTER_DAYS * 86400_000)
  await pruneOldSyntheses(propertyId, pruneCutoff)

  result.synthesisStatus = 'ok'
  return result
}
