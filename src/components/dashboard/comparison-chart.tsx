'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsMobile } from '@/hooks/use-mobile'

interface ComparisonDataPoint {
  name: string
  score: number
  [key: string]: string | number
}

interface ComparisonChartProps {
  title?: string
  data: ComparisonDataPoint[]
  height?: number
  className?: string
}

function getBarColor(score: number): string {
  if (score >= 80) return '#10b981' // emerald-500
  if (score >= 60) return '#f59e0b' // amber-500
  return '#ef4444' // red-500
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  const score = payload[0].value

  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <div
          className="size-2 rounded-full"
          style={{ backgroundColor: getBarColor(score) }}
        />
        <span className="text-muted-foreground">Score:</span>
        <span className="font-semibold tabular-nums">{score.toFixed(1)}</span>
      </div>
    </div>
  )
}

export function ComparisonChart({
  title,
  data,
  height = 350,
  className,
}: ComparisonChartProps) {
  const isMobile = useIsMobile()
  const chartHeight = isMobile ? 280 : height

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
            style={{ height: chartHeight }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const sortedData = [...data].sort((a, b) => b.score - a.score)

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: isMobile ? 12 : 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              horizontal={false}
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: isMobile ? 10 : 12 }}
              tickLine={false}
              axisLine={false}
              width={isMobile ? 78 : 120}
              className="fill-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="score"
              radius={[0, 4, 4, 0]}
              barSize={isMobile ? 16 : 24}
            >
              {sortedData.map((entry) => (
                <Cell key={entry.name} fill={getBarColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
