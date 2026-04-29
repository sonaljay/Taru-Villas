'use client'

import { CORE_ASPECTS } from '@/lib/ota/aspects'
import type { AspectTrend } from '@/lib/ota/types'
import type { SynthesisRow } from '@/lib/db/queries/ota'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OtaRefreshButton } from './ota-refresh-button'

interface OtaReview {
  id: string
  authorName: string | null
  rating: number
  text: string | null
  reviewedAt: Date
}

interface OtaTabProps {
  propertyId: string
  source: { id: string; externalId: string; lastFetchError: string | null } | null
  latest: SynthesisRow | null
  recentReviews: OtaReview[]
  trend: AspectTrend[]
  overallScoreOutOfTen: number | null
  isAdmin: boolean
}

function severityClasses(sev: 'low' | 'medium' | 'high') {
  if (sev === 'high') return 'border-red-500 bg-red-50 dark:bg-red-950 animate-pulse-slow'
  if (sev === 'medium') return 'border-red-300 bg-red-50/60 dark:bg-red-950/40'
  return 'border-red-200 bg-red-50/30 dark:bg-red-950/20'
}

export function OtaTab(props: OtaTabProps) {
  const { source, latest, recentReviews, trend, overallScoreOutOfTen, isAdmin } = props

  if (!source || !source.externalId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No Google listing connected.
          {isAdmin && (
            <> Set the Place ID in property settings to start collecting reviews.</>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!latest) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Awaiting first sync. Cron runs nightly at 03:00 UTC, or admin can click &quot;Refresh now&quot;.
        </CardContent>
      </Card>
    )
  }

  if (latest.status === 'insufficient_data') {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Need at least 3 reviews in the last 90 days to synthesize. Currently {latest.reviewsAnalyzed}.
        </CardContent>
      </Card>
    )
  }

  if (latest.status === 'error') {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Synthesis failed on last run. Will retry tonight.
          {isAdmin && latest.errorMessage && (
            <pre className="mt-2 rounded bg-muted p-2 text-xs">{latest.errorMessage}</pre>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Google rating</p>
          <p className="text-4xl font-bold">
            {latest.avgRating} ★{' '}
            <span className="text-2xl text-muted-foreground">
              ({overallScoreOutOfTen?.toFixed(1)}/10)
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latest.reviewsAnalyzed} reviews analyzed (last 90 days)
          </p>
        </div>
        {isAdmin && <OtaRefreshButton propertyId={props.propertyId} />}
      </div>

      {/* Aspect grid */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Aspect Scores</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CORE_ASPECTS.map((a) => {
            const cell = latest.aspectScores.core?.[a.key]
            const t = trend.find((x) => x.key === a.key)
            return (
              <Card key={a.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{a.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">
                    {cell?.score?.toFixed(1) ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cell?.mention_count ?? 0} mentions
                  </p>
                  {t && t.previous > 0 && (
                    <div
                      className={cn(
                        'mt-1 inline-flex items-center gap-0.5 text-xs',
                        t.delta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {t.delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                      {Math.abs(t.delta).toFixed(1)} vs 30d
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Dynamic highlights */}
      {latest.aspectScores.dynamic?.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Property Highlights</h2>
          <div className="flex flex-wrap gap-2">
            {latest.aspectScores.dynamic.map((d) => (
              <Badge key={d.name} variant="secondary" className="text-base">
                {d.name}: {d.score.toFixed(1)} · {d.mention_count} mentions
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Synthesis: 3-column */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.strengths.map((b, i) => (
              <div key={i}>
                <p className="font-medium">{b.headline}</p>
                <p className="text-sm text-muted-foreground">{b.detail}</p>
                <Badge variant="outline" className="mt-1">{b.mention_count} mentions</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-amber-700 dark:text-amber-400">
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.weaknesses.map((b, i) => (
              <div key={i}>
                <p className="font-medium">{b.headline}</p>
                <p className="text-sm text-muted-foreground">{b.detail}</p>
                <Badge variant="outline" className="mt-1">{b.mention_count} mentions</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-2 border-red-300">
          <CardHeader>
            <CardTitle className="text-base text-red-700 dark:text-red-400">
              Repetitive Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest.repetitiveIssues.length === 0 && (
              <p className="text-sm text-muted-foreground">None this period.</p>
            )}
            {latest.repetitiveIssues.map((r, i) => (
              <div key={i} className={cn('rounded border p-3', severityClasses(r.severity))}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{r.headline}</p>
                  <Badge variant="destructive" className="capitalize">{r.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{r.detail}</p>
                <Badge variant="outline" className="mt-1">{r.mention_count} mentions</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Reviews list */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Reviews</h2>
        <div className="space-y-3">
          {recentReviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{r.authorName ?? 'Anonymous'}</div>
                  <div className="text-sm">
                    {r.rating} ★ · {r.reviewedAt.toLocaleDateString()}
                  </div>
                </div>
                {r.text && <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Last synthesized {new Date(latest.generatedAt).toLocaleString()} · {latest.reviewsAnalyzed} reviews · prompt {latest.promptVersion}
        {isAdmin && source.lastFetchError && (
          <span className="ml-2 text-red-600">Last fetch error: {source.lastFetchError}</span>
        )}
      </p>
    </div>
  )
}
