'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { GuestProfile } from '@/lib/db/schema'

const STATUS_LABEL: Record<GuestProfile['status'], string> = {
  pending_questionnaire: 'Pending Pre-Arrival Questionnaire',
  pending_approval: 'Pending Approval',
  pending_checkin: 'Pending Check-In',
  checked_in: 'Checked-In',
  cancelled: 'Cancelled',
}

const STATUS_CLASS: Record<GuestProfile['status'], string> = {
  pending_questionnaire: 'bg-yellow-100 text-yellow-800',
  pending_approval: 'bg-blue-100 text-blue-800',
  pending_checkin: 'bg-purple-100 text-purple-800',
  checked_in: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
}

interface Props {
  property: { id: string; name: string; oracleHotelId: string | null }
  profiles: GuestProfile[]
}

export function GuestProfilesPageClient({ property, profiles }: Props) {
  const router = useRouter()
  const [pulling, setPulling] = useState(false)

  async function pull() {
    setPulling(true)
    try {
      const today = new Date()
      const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      const res = await fetch('/api/guest-profiles/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          fromDate: today.toISOString().slice(0, 10),
          toDate: in30.toISOString().slice(0, 10),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success(`Pulled ${data.pulled} arrivals (${data.checkedIn ?? 0} now checked-in)`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/guest-profiles')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Guest Profiles — {property.name}</h1>
            <p className="text-sm text-muted-foreground">Upcoming arrivals and pre-arrival status</p>
          </div>
        </div>
        <Button onClick={pull} disabled={pulling || !property.oracleHotelId}>
          <RefreshCw className={cn('size-4', pulling && 'animate-spin')} />
          {pulling ? 'Pulling…' : 'Pull arrivals'}
        </Button>
      </div>

      {!property.oracleHotelId && (
        <Card><CardContent className="py-4 text-sm text-amber-700">
          Set this property&apos;s Oracle Hotel ID (in Property Settings) before pulling arrivals.
        </CardContent></Card>
      )}

      {profiles.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No guest profiles yet. Click &ldquo;Pull arrivals&rdquo; to fetch upcoming reservations.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Confirmation</TableHead>
                <TableHead>Arrival</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.guestName ?? '—'}</TableCell>
                  <TableCell>{p.confirmationNumber ?? '—'}</TableCell>
                  <TableCell>{p.arrivalDate ?? '—'}</TableCell>
                  <TableCell>{p.roomNumber ?? p.roomType ?? '—'}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[p.status])}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}
