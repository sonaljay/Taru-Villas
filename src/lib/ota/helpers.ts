import { createHash } from 'node:crypto'
import { CORE_ASPECTS, type CoreAspectKey } from './aspects'
import type { AspectScores, AspectTrend } from './types'

/**
 * Stable per-review identifier. Google Places does not expose a real ID;
 * we hash author_name + reviewed_at + text. Edits to review text will
 * register as a new row — acceptable.
 */
export function hashReviewId(input: {
  authorName: string | null
  reviewedAt: Date
  text: string | null
}): string {
  const composite = [
    input.authorName ?? '',
    input.reviewedAt.toISOString(),
    input.text ?? '',
  ].join('|')
  return createHash('sha256').update(composite).digest('hex')
}

/** Google rating (1-5) → display scale (1-10). 4.6 → 9.2. */
export function googleRatingToTen(rating: number): number {
  return Math.round(rating * 2 * 10) / 10
}

/** Compute aspect-by-aspect deltas between two AspectScores blobs (core only). */
export function computeAspectTrend(
  current: AspectScores | null,
  previous: AspectScores | null
): AspectTrend[] {
  if (!current || !previous) return []
  return CORE_ASPECTS.map((aspect) => {
    const c = current.core?.[aspect.key as CoreAspectKey]?.score ?? 0
    const p = previous.core?.[aspect.key as CoreAspectKey]?.score ?? 0
    return { key: aspect.key, label: aspect.label, current: c, previous: p, delta: c - p }
  })
}
