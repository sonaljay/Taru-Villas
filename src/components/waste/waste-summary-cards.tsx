'use client'

import { Trash2, Newspaper, Wine, ShoppingBag, Utensils, Wrench, Cpu } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WASTE_CATEGORIES, type WasteCategoryKey } from '@/lib/waste/categories'

interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

interface WasteSummaryCardsProps {
  summary: WasteTotals | null
  loading: boolean
}

const ICONS: Record<WasteCategoryKey, typeof Newspaper> = {
  paperKg: Newspaper,
  glassKg: Wine,
  plasticKg: ShoppingBag,
  foodKg: Utensils,
  metalKg: Wrench,
  electronicKg: Cpu,
}

export function WasteSummaryCards({ summary, loading }: WasteSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total This Month
          </CardTitle>
          <Trash2 className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading ? '—' : `${(summary?.total ?? 0).toFixed(1)} kg`}
          </div>
        </CardContent>
      </Card>

      {WASTE_CATEGORIES.map((c) => {
        const Icon = ICONS[c.key]
        return (
          <Card key={c.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? '—' : `${(summary?.[c.key] ?? 0).toFixed(1)} kg`}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
