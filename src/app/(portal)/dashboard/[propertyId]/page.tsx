export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import {
  getPropertyScores,
  getCategoryBreakdown,
  getTrends,
  getRecentNotes,
} from '@/lib/db/queries/dashboard'
import {
  PropertyDashboard,
  type PropertyInfo,
  type CategoryScoreData,
  type PropertyTrendPoint,
} from '@/components/dashboard/property-dashboard'

// ---------------------------------------------------------------------------
// Page Component (Server)
// ---------------------------------------------------------------------------

export default async function PropertyDashboardPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireAuth()

  if (!profile) {
    return null
  }

  // Fetch property details
  const property = await getPropertyById(propertyId)
  if (!property) {
    notFound()
  }

  // Fetch all dashboard data in parallel — only submitted surveys
  const [scores, categories, trends, notes] = await Promise.all([
    getPropertyScores(propertyId),
    getCategoryBreakdown(propertyId),
    getTrends(propertyId, 12),
    getRecentNotes(propertyId, 20),
  ])

  // Build PropertyInfo
  const overallScore = scores?.averageScore ?? 0
  const trendValues = trends.map((t) => t.averageScore)
  const overallTrend =
    trendValues.length >= 2
      ? trendValues[trendValues.length - 1] - trendValues[trendValues.length - 2]
      : 0

  const propertyInfo: PropertyInfo = {
    id: property.id,
    name: property.name,
    code: property.code,
    imageUrl: property.imageUrl,
    location: property.location,
    overallScore: Math.round(overallScore * 10) / 10,
    overallTrend: Math.round(overallTrend * 10) / 10,
    lastSurveyDate: trends.length > 0 ? trends[trends.length - 1].month : null,
    submissionCount: scores?.submissionCount ?? 0,
  }

  // Build CategoryScoreData with trend (compare last two months if available)
  // We need per-category monthly data for trends, but we can approximate
  // using the overall category breakdown as the current score
  const categoryData: CategoryScoreData[] = categories.map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    score: Math.round(c.averageScore * 10) / 10,
    weight: c.weight,
    trend: 0, // No per-category trend data available from single breakdown
  }))

  // Build PropertyTrendPoint array
  const trendData: PropertyTrendPoint[] = trends.map((t) => {
    const [y, m] = t.month.split('-')
    const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
    return {
      date: label,
      overall: Math.round(t.averageScore * 10) / 10,
    }
  })

  return (
    <PropertyDashboard
      property={propertyInfo}
      categories={categoryData}
      trendData={trendData}
      notes={notes}
    />
  )
}
