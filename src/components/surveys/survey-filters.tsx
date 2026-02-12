'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
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
import { X } from 'lucide-react'

interface SurveyFiltersProps {
  properties: { id: string; name: string }[]
  currentPropertyId?: string
  currentStatus?: string
  currentDateFrom?: string
  currentDateTo?: string
}

export function SurveyFilters({
  properties,
  currentPropertyId,
  currentStatus,
  currentDateFrom,
  currentDateTo,
}: SurveyFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const createQueryString = useCallback(
    (params: Record<string, string | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          newParams.set(key, value)
        } else {
          newParams.delete(key)
        }
      }
      return newParams.toString()
    },
    [searchParams]
  )

  function updateFilter(key: string, value: string | undefined) {
    const qs = createQueryString({ [key]: value })
    router.push(`${pathname}?${qs}`)
  }

  function clearFilters() {
    router.push(pathname)
  }

  const hasFilters =
    currentPropertyId || currentStatus || currentDateFrom || currentDateTo

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Property</Label>
        <Select
          value={currentPropertyId ?? 'all'}
          onValueChange={(value) =>
            updateFilter('propertyId', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select
          value={currentStatus ?? 'all'}
          onValueChange={(value) =>
            updateFilter('status', value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input
          type="date"
          className="w-[160px]"
          value={currentDateFrom ?? ''}
          onChange={(e) =>
            updateFilter('dateFrom', e.target.value || undefined)
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input
          type="date"
          className="w-[160px]"
          value={currentDateTo ?? ''}
          onChange={(e) =>
            updateFilter('dateTo', e.target.value || undefined)
          }
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="size-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
