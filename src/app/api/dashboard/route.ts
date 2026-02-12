import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getPropertyScores,
  getAllPropertyScores,
  getCategoryBreakdown,
  getSubcategoryBreakdown,
  getTrends,
  type DateRange,
} from '@/lib/db/queries/dashboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDateRange(
  from: string | null,
  to: string | null
): DateRange | undefined {
  if (!from && !to) return undefined
  return {
    from: from ? new Date(from) : new Date('2000-01-01'),
    to: to ? new Date(to) : new Date(),
  }
}

// ---------------------------------------------------------------------------
// GET /api/dashboard
//
// Query parameters:
//   type        = overview | property | trends | comparison
//   propertyId  = UUID (required for type=property and type=trends)
//   dateFrom    = ISO date string (optional)
//   dateTo      = ISO date string (optional)
//   months      = number (optional, for type=trends, default 12)
//   surveyType  = internal | guest (optional)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') ?? 'overview'
    const propertyId = searchParams.get('propertyId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const monthsParam = searchParams.get('months')
    const surveyType = searchParams.get('surveyType') as 'internal' | 'guest' | null

    const dateRange = parseDateRange(dateFrom, dateTo)
    const st = surveyType || undefined

    switch (type) {
      // -----------------------------------------------------------------------
      // Overview: score cards for all properties
      // -----------------------------------------------------------------------
      case 'overview': {
        const scores = await getAllPropertyScores(profile.orgId, dateRange, st)
        return NextResponse.json({ type: 'overview', data: scores })
      }

      // -----------------------------------------------------------------------
      // Property: detailed scores + category + subcategory breakdown
      // -----------------------------------------------------------------------
      case 'property': {
        if (!propertyId) {
          return NextResponse.json(
            { error: 'propertyId is required for type=property' },
            { status: 400 }
          )
        }

        // Check property access
        const userProps = await getUserProperties(profile.id, profile.role)
        if (userProps && !userProps.includes(propertyId)) {
          return NextResponse.json(
            { error: 'Forbidden: no access to this property' },
            { status: 403 }
          )
        }

        const [scores, categories, subcategories] = await Promise.all([
          getPropertyScores(propertyId, dateRange, st),
          getCategoryBreakdown(propertyId, dateRange, st),
          getSubcategoryBreakdown(propertyId, dateRange, st),
        ])

        return NextResponse.json({
          type: 'property',
          data: { scores, categories, subcategories },
        })
      }

      // -----------------------------------------------------------------------
      // Trends: monthly trend line for a property
      // -----------------------------------------------------------------------
      case 'trends': {
        if (!propertyId) {
          return NextResponse.json(
            { error: 'propertyId is required for type=trends' },
            { status: 400 }
          )
        }

        // Check property access
        const userPropsTrends = await getUserProperties(profile.id, profile.role)
        if (userPropsTrends && !userPropsTrends.includes(propertyId)) {
          return NextResponse.json(
            { error: 'Forbidden: no access to this property' },
            { status: 403 }
          )
        }

        const months = monthsParam ? parseInt(monthsParam, 10) : 12
        if (isNaN(months) || months < 1 || months > 60) {
          return NextResponse.json(
            { error: 'months must be a number between 1 and 60' },
            { status: 400 }
          )
        }

        const trends = await getTrends(propertyId, months, st)

        return NextResponse.json({ type: 'trends', data: trends })
      }

      // -----------------------------------------------------------------------
      // Comparison: all property scores with category breakdown
      // -----------------------------------------------------------------------
      case 'comparison': {
        const allScores = await getAllPropertyScores(profile.orgId, dateRange, st)

        // For each property, get category breakdown
        const comparison = await Promise.all(
          allScores.map(async (prop) => {
            const categories = await getCategoryBreakdown(prop.propertyId, dateRange, st)
            return {
              ...prop,
              categories,
            }
          })
        )

        return NextResponse.json({ type: 'comparison', data: comparison })
      }

      // -----------------------------------------------------------------------
      // Unknown type
      // -----------------------------------------------------------------------
      default: {
        return NextResponse.json(
          { error: 'Invalid type. Use: overview, property, trends, or comparison' },
          { status: 400 }
        )
      }
    }
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
