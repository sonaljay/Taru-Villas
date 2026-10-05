'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { LoBookingReport } from '@/lib/db/queries/sales-marketing'
import { defaultFutureRange, inclusiveLastDate, type ReportRange } from '@/lib/sales-marketing/room-nights'
interface Props { properties: { id: string; name: string }[]; initial: LoBookingReport | null; initialRange: ReportRange }
const monthLabel = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
export function BookingsPageClient({ properties, initial, initialRange }: Props) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '')
  const [appliedProperty, setAppliedProperty] = useState(propertyId)
  const [fromMonth, setFromMonth] = useState(initialRange.fromDate.slice(0,7))
  const [toMonth, setToMonth] = useState(inclusiveLastDate(initialRange.toDateExclusive).slice(0,7))
  const [data, setData] = useState(initial)
  const [selectedMonth, setSelectedMonth] = useState(initial?.report.months[0]?.month ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const today = defaultFutureRange(new Date()).fromDate
  async function apply(event: React.FormEvent) {
    event.preventDefault()
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    setLoading(true); setError(null)
    try {
      const end = new Date(`${toMonth}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1)
      const fromDate = `${fromMonth}-01` < today ? today : `${fromMonth}-01`
      const qs = new URLSearchParams({ propertyId, fromDate, toDateExclusive: end.toISOString().slice(0,10) })
      const response = await fetch(`/api/sales-marketing?${qs}`, { cache: 'no-store', signal: abort.signal })
      const result = await response.json()
      if (!response.ok) throw Error(result.error ?? 'Booking report unavailable')
      setData(result); setAppliedProperty(propertyId); setSelectedMonth(result.report.months[0]?.month ?? '')
    } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Booking report unavailable') }
    finally { if (!abort.signal.aborted) setLoading(false) }
  }
  const stale = !!data?.sync.lastSuccessAt && Date.now() - new Date(data.sync.lastSuccessAt).getTime() > 86400000
  const month = data?.report.months.find(m => m.month === selectedMonth)
  const rows = data?.report.rows.filter(r => (r.monthlyNights[selectedMonth] ?? 0) > 0) ?? []
  return <div className="min-w-0 space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Sales &amp; Marketing</h1><p className="text-sm text-muted-foreground">Future bookings, measured in room nights by stay month.</p></div>
    {!properties.length ? <Card><CardContent className="space-y-2 py-12 text-center"><h2 className="font-medium">LO has not been connected to an accessible property.</h2><p className="text-sm text-muted-foreground">An administrator can map The Long House to LO in Property Settings after verifying its Oracle hotel name.</p></CardContent></Card> : <>
      <form onSubmit={apply} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2"><Label htmlFor="sales-property">Property</Label><select id="sales-property" value={propertyId} onChange={e => setPropertyId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{properties.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="sales-from">From month</Label><Input id="sales-from" type="month" min={today.slice(0,7)} required value={fromMonth} onChange={e => setFromMonth(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="sales-to">Through month</Label><Input id="sales-to" type="month" min={fromMonth} required value={toMonth} onChange={e => setToMonth(e.target.value)} /></div>
        <Button className="self-end" disabled={loading}>{loading ? 'Loading bookings…' : 'Show bookings'}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && <>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{properties.find(p => p.id === appliedProperty)?.name}</h2><p className="text-sm text-muted-foreground">{data.sync.lastSuccessAt ? `Last complete refresh: ${new Date(data.sync.lastSuccessAt).toLocaleString()}` : 'No complete booking import yet.'}</p></div><Button variant="outline" asChild><Link href={`/properties/${appliedProperty}/guest-profiles`}>Refresh bookings</Link></Button></div>
        {(!data.coverageComplete || stale || data.sync.error) && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {!data.coverageComplete && <p>The last complete import does not cover this whole period. Refresh bookings or select a covered period.</p>}
          {stale && <p>These bookings were refreshed more than 24 hours ago.</p>}
          {data.sync.error && <p>The latest refresh failed. Showing the last complete bookings.</p>}
          {data.sync.fromDate && <p className="mt-1">Arrival coverage: {data.sync.fromDate} to {data.sync.toDate}, plus current in-house guests.</p>}
        </div>}
        {data.report.excludedQualityRecords > 0 && <p role="status" className="text-sm text-amber-800">{data.report.excludedQualityRecords} records excluded because status, room quantity, dates or shared inventory need review.</p>}
        {data.sync.lastSuccessAt ? <>
          <Card><CardHeader><CardTitle className="flex flex-wrap items-baseline justify-between gap-2"><span>Booked room nights</span><span className="text-2xl tabular-nums">{data.report.totalRoomNights.toLocaleString()}</span></CardTitle><p className="text-sm text-muted-foreground">Each room contributes one night for every stay date. Checkout day is excluded.</p></CardHeader><CardContent className="min-w-0"><ResponsiveContainer width="100%" height={280}><BarChart data={data.report.months} margin={{ left: 0, right: 10 }} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} minTickGap={18} /><YAxis allowDecimals={false} width={38} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={value => monthLabel(String(value))} /><Bar dataKey="roomNights" name="Booked room nights" fill="#047857" radius={[3,3,0,0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></CardContent></Card>
          <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Stay month</TableHead><TableHead className="text-right">Room nights</TableHead><TableHead className="text-right">Reservations</TableHead></TableRow></TableHeader><TableBody>{data.report.months.map(m => <TableRow key={m.month} data-state={selectedMonth === m.month ? 'selected' : undefined}><TableCell><button className="rounded text-left underline-offset-4 hover:underline focus-visible:outline-2" onClick={() => setSelectedMonth(m.month)}>{monthLabel(m.month)}{m.month === today.slice(0,7) && <span className="block text-xs text-muted-foreground">Remaining nights</span>}</button></TableCell><TableCell className="text-right tabular-nums">{m.roomNights.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{m.contributingReservations}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          <p className="text-xs text-muted-foreground">Reservations spanning two months appear in both months. Reservation counts should not be added across months.</p>
          <Card><CardHeader><CardTitle>{month ? monthLabel(month.month) : 'Select a month'} booking details</CardTitle>{month && <p className="text-sm text-muted-foreground">{month.byChannel.map(c => `${c.channel}: ${c.roomNights} room nights`).join('; ') || 'No booked room nights in this month.'}</p>}</CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">Confirmation</TableHead><TableHead>Stay dates</TableHead><TableHead>Room type</TableHead><TableHead className="pr-6 text-right">Nights</TableHead></TableRow></TableHeader><TableBody>{rows.map(r => <TableRow key={r.reservationId}><TableCell className="pl-6">{r.confirmationNumber ?? '—'}</TableCell><TableCell className="whitespace-nowrap">{r.arrivalDate}<br />{r.departureDate}</TableCell><TableCell>{r.roomType ?? '—'}<span className="block text-xs text-muted-foreground">{r.roomQuantity} {r.roomQuantity === 1 ? 'room' : 'rooms'}</span></TableCell><TableCell className="pr-6 text-right tabular-nums">{r.monthlyNights[selectedMonth]}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No contributing bookings.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        </> : <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Refresh bookings to see the forecast for this property.</CardContent></Card>}
      </>}
    </>}
  </div>
}
