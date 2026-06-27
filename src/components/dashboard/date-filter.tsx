'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQueryState } from 'nuqs'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface DateRange {
  from: Date
  to: Date
}

interface DateFilterProps {
  onChange: (range: DateRange) => void
  className?: string
}

type PresetKey = '30d' | '3m' | '6m' | '1y' | 'custom'

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '30d', label: 'Last 30 days' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
  { key: 'custom', label: 'Custom' },
]

function getPresetRange(key: PresetKey): DateRange | null {
  const to = new Date()
  const from = new Date()

  switch (key) {
    case '30d':
      from.setDate(from.getDate() - 30)
      return { from, to }
    case '3m':
      from.setMonth(from.getMonth() - 3)
      return { from, to }
    case '6m':
      from.setMonth(from.getMonth() - 6)
      return { from, to }
    case '1y':
      from.setFullYear(from.getFullYear() - 1)
      return { from, to }
    default:
      return null
  }
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function DateFilter({ onChange, className }: DateFilterProps) {
  const [preset, setPreset] = useQueryState('range', {
    defaultValue: '6m',
  })
  const [fromParam, setFromParam] = useQueryState('from')
  const [toParam, setToParam] = useQueryState('to')

  const [customFrom, setCustomFrom] = useState(
    fromParam || toDateString(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
  )
  const [customTo, setCustomTo] = useState(
    toParam || toDateString(new Date())
  )

  const activePreset = preset as PresetKey

  const applyRange = useCallback(
    (range: DateRange) => {
      onChange(range)
    },
    [onChange]
  )

  // Apply preset on mount and when it changes
  useEffect(() => {
    if (activePreset !== 'custom') {
      const range = getPresetRange(activePreset)
      if (range) {
        applyRange(range)
      }
    } else if (customFrom && customTo) {
      applyRange({ from: new Date(customFrom), to: new Date(customTo) })
    }
    // Only run when preset changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreset])

  const handlePresetClick = (key: PresetKey) => {
    setPreset(key)

    if (key !== 'custom') {
      const range = getPresetRange(key)
      if (range) {
        setFromParam(null)
        setToParam(null)
        applyRange(range)
      }
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setFromParam(customFrom)
      setToParam(customTo)
      applyRange({ from: new Date(customFrom), to: new Date(customTo) })
    }
  }

  const activeLabel =
    PRESETS.find((p) => p.key === activePreset)?.label ?? 'Period'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end',
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Period:
        </span>
      </div>

      {/* Mobile: compact dropdown */}
      <Select
        value={activePreset}
        onValueChange={(v) => handlePresetClick(v as PresetKey)}
      >
        <SelectTrigger size="sm" className="w-full sm:hidden">
          <SelectValue>{activeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Desktop: button group */}
      <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={activePreset === p.key ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {activePreset === 'custom' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="date-from" className="text-xs">
                From
              </Label>
              <Input
                id="date-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-full text-xs sm:w-36"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date-to" className="text-xs">
                To
              </Label>
              <Input
                id="date-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-full text-xs sm:w-36"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 w-full text-xs sm:w-auto"
            onClick={handleCustomApply}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
