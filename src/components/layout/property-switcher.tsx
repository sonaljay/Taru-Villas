'use client'

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
  const [propertyId, setPropertyId] = useQueryState('propertyId', {
    defaultValue: '',
    shallow: false,
  })

  const isAdmin = profile.role === 'admin'
  const properties = profile.assignments ?? []

  // No properties assigned and not admin — nothing to show
  if (!isAdmin && properties.length === 0) {
    return null
  }

  // Only one property and not admin — show a static label instead of a dropdown
  if (!isAdmin && properties.length === 1) {
    const prop = properties[0]
    return (
      <div className="flex items-center gap-2 text-sm">
        <Building2 className="size-4 text-muted-foreground" />
        <span className="font-medium">{prop.propertyName}</span>
        <Badge variant="outline" className="text-[10px] font-normal">
          {prop.propertyCode}
        </Badge>
      </div>
    )
  }

  return (
    <Select
      value={propertyId}
      onValueChange={(value) => setPropertyId(value === 'all' ? '' : value)}
    >
      <SelectTrigger className="w-[200px]" size="sm">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
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
    </Select>
  )
}
