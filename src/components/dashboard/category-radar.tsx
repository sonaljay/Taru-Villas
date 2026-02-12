'use client'

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RadarDataPoint {
  category: string
  score: number
  fullMark: number
}

interface CategoryRadarProps {
  title?: string
  data: RadarDataPoint[]
  height?: number
  className?: string
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: RadarDataPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null

  const item = payload[0].payload

  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-sm font-medium">{item.category}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Score:</span>
        <span className="font-semibold tabular-nums">
          {item.score.toFixed(1)}
        </span>
        <span className="text-muted-foreground">/100</span>
      </div>
    </div>
  )
}

export function CategoryRadar({
  title,
  data,
  height = 350,
  className,
}: CategoryRadarProps) {
  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        {title && (
          <CardHeader>
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid className="stroke-border" />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Radar
              name="Score"
              dataKey="score"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
