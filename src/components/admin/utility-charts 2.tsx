'use client'

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DailyData {
  date: string
  consumption: number
}

interface MonthlyData {
  month: string
  consumption: number
  readingCount: number
}

interface UtilityChartsProps {
  dailyConsumption: DailyData[]
  history: MonthlyData[]
  utilityType: 'water' | 'electricity'
  loading: boolean
}

function formatMonth(monthStr: string) {
  const [y, m] = monthStr.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function UtilityCharts({
  dailyConsumption,
  history,
  utilityType,
  loading,
}: UtilityChartsProps) {
  const unit = utilityType === 'water' ? 'kL' : 'kWh'
  const color = utilityType === 'water' ? 'var(--chart-1)' : 'var(--chart-3)'

  const dailyData = dailyConsumption.map((d) => ({
    date: formatDate(d.date),
    consumption: d.consumption,
  }))

  const monthlyData = history.map((h) => ({
    month: formatMonth(h.month),
    consumption: h.consumption,
  }))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Daily Consumption */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Consumption</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              Loading...
            </div>
          ) : dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value: unknown) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    return [`${v.toFixed(1)} ${unit}`, 'Consumption']
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="consumption"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              Not enough data — enter at least 2 readings
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              Loading...
            </div>
          ) : monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value: unknown) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    return [`${v.toFixed(1)} ${unit}`, 'Consumption']
                  }}
                />
                <Bar
                  dataKey="consumption"
                  fill={color}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              No historical data yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
