'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface OtaOverviewProps {
  portfolio: Array<{
    property: { id: string; name: string }
    synthesis: { status: string; avgRating: string | null; repetitiveIssues: Array<{ headline: string; severity: 'low' | 'medium' | 'high'; mention_count: number }> } | null
  }>
  avgRating: number | null
  reviewsThisMonth: number
  propertiesWithRepetitiveIssues: number
  crossPortfolioIssues: Array<{ headline: string; detail: string; mention_count: number; severity: 'low' | 'medium' | 'high'; propertyName: string }>
}

export function OtaOverviewTab(props: OtaOverviewProps) {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Portfolio rating</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{props.avgRating ? `${props.avgRating.toFixed(2)} ★` : '—'}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reviews this month</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{props.reviewsThisMonth}</p></CardContent>
        </Card>
        <Card className={cn(props.propertiesWithRepetitiveIssues > 0 && 'border-red-300')}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Properties with repeat issues</CardTitle></CardHeader>
          <CardContent>
            <p className={cn('text-2xl font-bold', props.propertiesWithRepetitiveIssues > 0 && 'text-red-600')}>
              {props.propertiesWithRepetitiveIssues}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Properties tracked</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{props.portfolio.length}</p></CardContent>
        </Card>
      </div>

      {/* Property comparison */}
      <Card>
        <CardHeader><CardTitle>Property ratings</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {props.portfolio.map((p) => (
              <div key={p.property.id} className="flex items-center justify-between">
                <span className="text-sm">{p.property.name.replace('Taru Villas - ', '')}</span>
                <span className="text-sm font-medium tabular-nums">
                  {p.synthesis?.avgRating ? `${p.synthesis.avgRating} ★` : '—'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cross-portfolio repetitive issues */}
      <Card>
        <CardHeader><CardTitle className="text-red-700 dark:text-red-400">Cross-portfolio repetitive issues</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {props.crossPortfolioIssues.length === 0 && (
            <p className="text-sm text-muted-foreground">No repetitive issues across the portfolio.</p>
          )}
          {props.crossPortfolioIssues.map((r, i) => (
            <div key={i} className="rounded border border-red-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  <span className="text-muted-foreground">{r.propertyName}:</span> {r.headline}
                </p>
                <Badge variant="destructive" className="capitalize">{r.severity}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{r.detail}</p>
              <Badge variant="outline" className="mt-1">{r.mention_count} mentions</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
