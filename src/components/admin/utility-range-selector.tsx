'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryState } from 'nuqs'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveRange, type RangePreset, type ResolvedRange } from '@/lib/utilities/date-ranges'

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'last-3m', label: '3 months' },
  { key: 'last-6m', label: '6 months' },
  { key: 'last-12m', label: '12 months' },
  { key: 'custom', label: 'Custom' },
]

const today = () => new Date().toISOString().split('T')[0]

interface Props {
  onChange: (r: ResolvedRange & { preset: RangePreset }) => void
}

export function UtilityRangeSelector({ onChange }: Props) {
  const [preset, setPreset] = useQueryState('range', { defaultValue: 'this-month' })
  const [fromParam, setFromParam] = useQueryState('from')
  const [toParam, setToParam] = useQueryState('to')
  const active = preset as RangePreset
  const [customFrom, setCustomFrom] = useState(fromParam || today())
  const [customTo, setCustomTo] = useState(toParam || today())

  const emit = useCallback(
    (p: RangePreset, cf?: string, ct?: string) => {
      const r = resolveRange(p, today(), cf, ct)
      onChange({ ...r, preset: p })
    },
    [onChange]
  )

  // Emit on mount + whenever the preset changes (custom emits via Apply)
  useEffect(() => {
    if (active !== 'custom') emit(active)
    else if (customFrom && customTo) emit('custom', customFrom, customTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const clickPreset = (key: RangePreset) => {
    setPreset(key)
    if (key !== 'custom') {
      setFromParam(null)
      setToParam(null)
      emit(key)
    }
  }
  const applyCustom = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      setFromParam(customFrom)
      setToParam(customTo)
      emit('custom', customFrom, customTo)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1.5">
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Period:</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.key} variant={active === p.key ? 'default' : 'outline'} size="sm"
            className="h-8 text-xs" onClick={() => clickPreset(p.key)}>
            {p.label}
          </Button>
        ))}
      </div>
      {active === 'custom' && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="util-from" className="text-xs">From</Label>
            <Input id="util-from" type="date" value={customFrom} max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="util-to" className="text-xs">To</Label>
            <Input id="util-to" type="date" value={customTo} min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={applyCustom}>Apply</Button>
        </div>
      )}
    </div>
  )
}
