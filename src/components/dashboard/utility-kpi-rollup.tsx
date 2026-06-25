import { Droplets, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PropertyKpiRollup } from '@/lib/db/queries/dashboard'

function pctColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground'
  if (pct >= 80) return 'text-emerald-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function pctLabel(pct: number | null) {
  return pct === null ? '—' : `${pct.toFixed(0)}%`
}

export function UtilityKpiRollup({ rollup }: { rollup: PropertyKpiRollup[] }) {
  if (rollup.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Utility KPI Achievement (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rollup.map((r) => (
            <div key={r.propertyId} className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-2 truncate">
                {r.propertyName.replace('Taru Villas - ', '')}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Zap className="size-3.5" /> Electricity
                </span>
                <span className={`font-semibold tabular-nums ${pctColor(r.electricityPct)}`}>
                  {pctLabel(r.electricityPct)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="size-3.5" /> Water
                </span>
                <span className={`font-semibold tabular-nums ${pctColor(r.waterPct)}`}>
                  {pctLabel(r.waterPct)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
