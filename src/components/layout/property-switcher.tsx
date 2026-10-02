'use client'

import { useParams, usePathname } from 'next/navigation'
import { useUnsavedChangesNavigation } from '@/hooks/use-unsaved-changes'
import { useQueryState } from 'nuqs'
import { Building2 } from 'lucide-react'

import { useAuth } from '@/components/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function PropertySwitcher() {
  const { profile } = useAuth()
  const params = useParams<{ propertyId?: string }>()
  const pathname = usePathname()
  const { confirmNavigation } = useUnsavedChangesNavigation()
  const [propertyId, setPropertyId] = useQueryState('propertyId', {
    defaultValue: '',
    shallow: false,
  })

  const isAdmin = profile.role === 'admin'
  const properties = profile.assignments ?? []

  const routePropertyId = params.propertyId
  if (routePropertyId) {
    const property = properties.find(item => item.propertyId === routePropertyId)
    return <span className="max-w-36 truncate text-sm font-medium sm:max-w-64" title={property?.propertyName}>{property?.propertyName ?? 'Property workspace'}</span>
  }
  if (!['/tasks', '/surveys'].includes(pathname)) return null

  // No properties assigned and not admin — nothing to show
  if (!isAdmin && properties.length === 0) {
    return null
  }

  // Only one property and not admin — show a static label instead of a dropdown
  if (!isAdmin && properties.length === 1) {
    const prop = properties[0]
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{prop.propertyName}</span>
        <Badge variant="outline" className="hidden text-[10px] font-normal sm:inline-flex">
          {prop.propertyCode}
        </Badge>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1"><span className="hidden text-xs text-muted-foreground sm:block">Filter by property</span><Select
      value={propertyId}
      onValueChange={(value) => { if (confirmNavigation()) setPropertyId(value === 'all' ? '' : value) }}
    >
      <SelectTrigger aria-label="Filter by property" className="w-[140px] sm:w-[200px]" size="sm">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All Properties" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {isAdmin && <SelectItem value="all">All Properties</SelectItem>}
        {properties.map((prop) => (
          <SelectItem key={prop.propertyId} value={prop.propertyId}>
            <div className="flex items-center gap-2">
              <span>{prop.propertyName}</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {prop.propertyCode}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select></div>
  )
}
