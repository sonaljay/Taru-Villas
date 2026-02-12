'use client'

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ScoreCardProps {
  title: string
  score: number
  trend?: number
  subtitle?: string
  onClick?: () => void
  className?: string
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 6) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return 'bg-emerald-50 dark:bg-emerald-950/30'
  if (score >= 6) return 'bg-amber-50 dark:bg-amber-950/30'
  return 'bg-red-50 dark:bg-red-950/30'
}

function getTrendColor(trend: number): string {
  if (trend > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (trend < 0) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

export function ScoreCard({
  title,
  score,
  trend,
  subtitle,
  onClick,
  className,
}: ScoreCardProps) {
  return (
    <Card
      className={cn(
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/20',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="pt-0">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground/70">{subtitle}</p>
            )}
          </div>
          {trend !== undefined && (
            <div
              className={cn(
                'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                trend > 0 && 'bg-emerald-50 dark:bg-emerald-950/30',
                trend < 0 && 'bg-red-50 dark:bg-red-950/30',
                trend === 0 && 'bg-muted',
                getTrendColor(trend)
              )}
            >
              {trend > 0 ? (
                <ArrowUpRight className="size-3" />
              ) : trend < 0 ? (
                <ArrowDownRight className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              <span>{Math.abs(trend).toFixed(1)}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={cn(
              'text-4xl font-bold tracking-tight tabular-nums',
              getScoreColor(score)
            )}
          >
            {score.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">/10</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              score >= 8 && 'bg-emerald-500',
              score >= 6 && score < 8 && 'bg-amber-500',
              score < 6 && 'bg-red-500'
            )}
            style={{ width: `${Math.min(100, Math.max(0, (score / 10) * 100))}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export { getScoreColor, getScoreBgColor }
