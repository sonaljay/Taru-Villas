'use client'

import { ArrowUp, ArrowDown, Droplets, Zap, Calculator, TrendingUp, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Period {
  totalConsumption: number | null
  avgPerDay: number | null
  totalCost: number | null
  kpiPct: number | null
  kpiEvaluatedDays: number
}

interface Deltas {
  consumptionPct: number | null
  avgPct: number | null
  costPct: number | null
  kpiDeltaPp: number | null
}

interface PredictionShape {
  predictedConsumption: number
  predictedCost: number
  daysInMonth: number
}

interface SummaryCardsProps {
  utilityType: 'water' | 'electricity'
  isThisMonth: boolean
  current: Period | null
  deltas: Deltas | null
  prediction: PredictionShape | null
  tiersConfigured: boolean
  rangeLabel: string
  showKpi: boolean
  loading: boolean
}

function Delta({
  pct,
  goodWhenDown,
  suffix = '%',
}: {
  pct: number | null
  goodWhenDown: boolean
  suffix?: string
}) {
  if (pct === null) return null
  const up = pct > 0
  const good = goodWhenDown ? !up : up
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-600'}`}
    >
      <Icon className="size-3" />
      {Math.abs(pct).toFixed(0)}
      {suffix}
    </span>
  )
}

export function UtilitySummaryCards({
  utilityType,
  isThisMonth,
  current,
  deltas,
  prediction,
  tiersConfigured,
  rangeLabel,
  showKpi,
  loading,
}: SummaryCardsProps) {
  const unit = utilityType === 'water' ? 'kL' : 'kWh'
  const MainIcon = utilityType === 'water' ? Droplets : Zap

  const formatLKR = (val: number) =>
    `LKR ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const avgPerDayStr =
    current?.avgPerDay != null
      ? `avg ${current.avgPerDay.toFixed(1)} ${unit}/day`
      : null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Total Consumption */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Consumption
          </CardTitle>
          <MainIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading
              ? '—'
              : current?.totalConsumption != null
                ? `${current.totalConsumption.toFixed(1)} ${unit}`
                : '—'}
          </div>
          {!loading && (
            <div className="mt-1 flex items-center gap-2">
              <Delta pct={deltas?.consumptionPct ?? null} goodWhenDown={true} />
              {(avgPerDayStr || rangeLabel) && (
                <p className="text-xs text-muted-foreground">
                  {[avgPerDayStr, rangeLabel].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total Cost */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Cost
          </CardTitle>
          <Calculator className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading
              ? '—'
              : !tiersConfigured
                ? 'No rates set'
                : current?.totalCost != null
                  ? formatLKR(current.totalCost)
                  : '—'}
          </div>
          {!loading && tiersConfigured && (
            <div className="mt-1">
              <Delta pct={deltas?.costPct ?? null} goodWhenDown={true} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Achieved — only when showKpi */}
      {showKpi && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              KPI Achieved
            </CardTitle>
            <Target className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading
                ? '—'
                : current?.kpiPct != null
                  ? `${current.kpiPct.toFixed(0)}%`
                  : 'No KPI set'}
            </div>
            {!loading && current?.kpiPct != null && (
              <div className="mt-1 flex items-center gap-2">
                <Delta
                  pct={deltas?.kpiDeltaPp ?? null}
                  goodWhenDown={false}
                  suffix=" pp"
                />
                {current.kpiEvaluatedDays > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {current.kpiEvaluatedDays} day
                    {current.kpiEvaluatedDays === 1 ? '' : 's'} evaluated
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Predicted Usage + Predicted Bill — only when isThisMonth && prediction */}
      {isThisMonth && prediction && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Predicted Usage
              </CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading
                  ? '—'
                  : `${prediction.predictedConsumption.toFixed(1)} ${unit}`}
              </div>
              {!loading && (
                <p className="text-xs text-muted-foreground mt-1">
                  {prediction.daysInMonth} days in month
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Predicted Bill
              </CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading
                  ? '—'
                  : tiersConfigured
                    ? formatLKR(prediction.predictedCost)
                    : 'No rates set'}
              </div>
              {!loading && (
                <p className="text-xs text-muted-foreground mt-1">
                  full month estimate
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
