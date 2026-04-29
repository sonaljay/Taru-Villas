import {
  getLatestSynthesis,
  getSynthesisForTrend,
  getRecentReviews,
  getSourceForProperty,
  getOrgPortfolioSyntheses,
  getReviewsThisMonth,
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

export async function loadOtaOrgData(orgId: string) {
  const [portfolio, reviewsThisMonth] = await Promise.all([
    getOrgPortfolioSyntheses(orgId),
    getReviewsThisMonth(orgId),
  ])

  const okSyntheses = portfolio
    .map((p) => p.synthesis)
    .filter((s): s is NonNullable<typeof s> => s?.status === 'ok')

  const avgRating =
    okSyntheses.length === 0
      ? null
      : okSyntheses.reduce((acc, s) => acc + Number(s.avgRating ?? 0), 0) / okSyntheses.length

  const propertiesWithRepetitiveIssues = portfolio.filter(
    (p) => p.synthesis?.status === 'ok' && p.synthesis.repetitiveIssues.length > 0
  ).length

  const crossPortfolioIssues = portfolio.flatMap((p) =>
    p.synthesis?.status === 'ok'
      ? p.synthesis.repetitiveIssues.map((r) => ({ ...r, propertyName: p.property.name }))
      : []
  )
  const sevRank = { high: 0, medium: 1, low: 2 } as const
  crossPortfolioIssues.sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] || b.mention_count - a.mention_count
  )

  return {
    portfolio,
    avgRating,
    reviewsThisMonth,
    propertiesWithRepetitiveIssues,
    crossPortfolioIssues,
  }
}
