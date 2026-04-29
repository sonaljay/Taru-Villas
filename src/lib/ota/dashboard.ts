import {
  getLatestSynthesis,
  getSynthesisForTrend,
  getRecentReviews,
  getSourceForProperty,
} from '@/lib/db/queries/ota'
import { computeAspectTrend, googleRatingToTen } from './helpers'
import { PROMPT_VERSION } from './synthesis'

export async function loadOtaPropertyData(propertyId: string) {
  const [source, latest, recentReviews] = await Promise.all([
    getSourceForProperty(propertyId, 'google'),
    getLatestSynthesis(propertyId),
    getRecentReviews(propertyId, 25),
  ])

  const trendBaseline = latest
    ? await getSynthesisForTrend({
        propertyId,
        promptVersion: PROMPT_VERSION,
        before: new Date(Date.now() - 30 * 86400_000),
      })
    : null

  const trend =
    latest?.status === 'ok' && trendBaseline?.status === 'ok'
      ? computeAspectTrend(latest.aspectScores, trendBaseline.aspectScores)
      : []

  return {
    source,
    latest,
    recentReviews,
    trend,
    overallScoreOutOfTen: latest?.avgRating
      ? googleRatingToTen(Number(latest.avgRating))
      : null,
  }
}
