'use client'

import { Droplets, Zap, TrendingUp, Calculator } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SummaryCardsProps {
  utilityType: 'water' | 'electricity'
  actualConsumption: number
  actualCost: number
  predictedConsumption: number
  predictedCost: number
  avgDailyConsumption: number
  daysElapsed: number
  daysInMonth: number
  tiersConfigured: boolean
  loading: boolean
}

export function UtilitySummaryCards({
  utilityType,
  actualConsumption,
  actualCost,
  predictedConsumption,
  predictedCost,
  avgDailyConsumption,
  daysElapsed,
  daysInMonth,
  tiersConfigured,
  loading,
}: SummaryCardsProps) {
  const unit = utilityType === 'water' ? 'kL' : 'kWh'
  const icon = utilityType === 'water' ? Droplets : Zap

  const cards = [
    {
      title: 'Consumption To Date',
      value: loading ? '—' : `${actualConsumption.toFixed(1)} ${unit}`,
      subtitle: loading
        ? ''
        : `avg ${avgDailyConsumption.toFixed(1)} ${unit}/day`,
      icon,
    },
    {
      title: 'Cost To Date',
      value: loading
        ? '—'
        : tiersConfigured
          ? `LKR ${actualCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'No rates set',
      subtitle: loading ? '' : `${daysElapsed} days tracked`,
      icon: Calculator,
    },
    {
      title: 'Predicted Usage',
      value: loading ? '—' : `${predictedConsumption.toFixed(1)} ${unit}`,
      subtitle: loading ? '' : `${daysInMonth} days in month`,
      icon: TrendingUp,
    },
    {
      title: 'Predicted Bill',
      value: loading
        ? '—'
        : tiersConfigured
          ? `LKR ${predictedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'No rates set',
      subtitle: loading ? '' : 'full month estimate',
      icon: TrendingUp,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            {card.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
