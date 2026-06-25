'use client'

import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface OccupancyFormProps {
  propertyId: string
  date: string
  initialGuests?: number | null
  initialStaff?: number | null
  onSuccess: () => void
}

export function UtilityOccupancyForm({
  propertyId,
  date,
  initialGuests,
  initialStaff,
  onSuccess,
}: OccupancyFormProps) {
  const [guestCount, setGuestCount] = useState('')
  const [staffCount, setStaffCount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setGuestCount(initialGuests != null ? String(initialGuests) : '')
    setStaffCount(initialStaff != null ? String(initialStaff) : '')
  }, [initialGuests, initialStaff, date])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/utilities/occupancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          logDate: date,
          guestCount: parseInt(guestCount) || 0,
          staffCount: parseInt(staffCount) || 0,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save occupancy')
      }
      toast.success('Occupancy saved')
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="size-4" />
          Daily Occupancy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="occ-guests">Guests</Label>
            <Input
              id="occ-guests"
              type="number"
              min="0"
              className="w-28"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occ-staff">Staff</Label>
            <Input
              id="occ-staff"
              type="number"
              min="0"
              className="w-28"
              value={staffCount}
              onChange={(e) => setStaffCount(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
          <p className="text-xs text-muted-foreground basis-full">
            For {date}. Guest count drives the electricity KPI target.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
