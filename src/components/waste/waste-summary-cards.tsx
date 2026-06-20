'use client'

import { Trash2, Newspaper, Wine, ShoppingBag, Utensils, Wrench, Cpu } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WasteCategoryKey } from '@/lib/waste/categories'

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

const CARD_META: { key: WasteCategoryKey; label: string; icon: typeof Newspaper }[] = [
  { key: 'paperKg', label: 'Paper', icon: Newspaper },
  { key: 'glassKg', label: 'Glass', icon: Wine },
  { key: 'plasticKg', label: 'Polythene & Plastic', icon: ShoppingBag },
  { key: 'foodKg', label: 'Food', icon: Utensils },
  { key: 'metalKg', label: 'Metal', icon: Wrench },
  { key: 'electronicKg', label: 'Electronic Waste', icon: Cpu },
]

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

      {CARD_META.map((c) => (
        <Card key={c.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.label}
            </CardTitle>
            <c.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '—' : `${(summary?.[c.key] ?? 0).toFixed(1)} kg`}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
