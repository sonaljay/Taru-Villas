'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WASTE_CATEGORIES } from '@/lib/waste/categories'

interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

interface WasteChartsProps {
  summary: WasteTotals | null
  history: ({ month: string } & WasteTotals)[]
  loading: boolean
}

function formatMonth(monthStr: string) {
  const [y, m] = monthStr.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

export function WasteCharts({ summary, history, loading }: WasteChartsProps) {
  const categoryData = WASTE_CATEGORIES.map((c) => ({
    name: c.label,
    kg: summary?.[c.key] ?? 0,
  }))

  const monthlyData = history.map((h) => ({
    month: formatMonth(h.month),
    total: h.total,
  }))

  const hasCategoryData = (summary?.total ?? 0) > 0

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* This month by category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This Month by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              Loading...
            </div>
          ) : hasCategoryData ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  formatter={(value: unknown) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    return [`${v.toFixed(1)} kg`, 'Waste']
                  }}
                />
                <Bar dataKey="kg" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              No waste logged this month yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly total trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Total Trend</CardTitle>
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
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  formatter={(value: unknown) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    return [`${v.toFixed(1)} kg`, 'Total']
                  }}
                />
                <Bar dataKey="total" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
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
