'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, PlugZap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { QuestionBuilder } from './question-builder'
import { QuestionnaireReview } from './questionnaire-review'
import { cn } from '@/lib/utils'
import type { GuestProfile } from '@/lib/db/schema'

interface Props {
  property: { id: string; name: string; oracleHotelId: string | null }
  profiles: GuestProfile[]
  isAdmin: boolean
  syncStatus: { lastSuccessAt: string | null; fromDate: string | null; toDate: string | null; state: string; error: string | null }
}

export function GuestProfilesPageClient({ property, profiles, isAdmin, syncStatus }: Props) {
  const router = useRouter()
  const [tab,setTab]=useState<'bookings'|'questions'>('bookings')
  const [reviewId,setReviewId]=useState<string|null>(null)
  const [privateLink,setPrivateLink]=useState<string|null>(null)
  const [linkBusy,setLinkBusy]=useState<string|null>(null)
  const [pulling, setPulling] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(syncStatus)
  const [progress, setProgress] = useState(0)
  const stopped = useRef(false)
  useEffect(() => () => { stopped.current = true }, [])

  async function testConnection() {
    setTesting(true)
    try {
      const res = await fetch('/api/oracle/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: property.id }) })
      const data = await res.json()
      if (data.ok) {
        toast.success('Oracle connection OK')
      } else {
        toast.error(data.error ?? 'Oracle connection failed')
      }
    } catch {
      toast.error('Oracle connection failed')
    } finally {
      setTesting(false)
    }
  }

  async function pull() {
    stopped.current = false
    setPulling(true)
    setProgress(0)
    try {
      const fromDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })
      const [year, month] = fromDate.split('-').map(Number)
      const toDate = new Date(Date.UTC(year, month + 11, 0)).toISOString().slice(0, 10)
      const started = Date.now()
      while (!stopped.current && Date.now() - started < 10 * 60_000) {
        const res = await fetch('/api/guest-profiles/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: property.id, fromDate, toDate }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Sync failed')
        setProgress(value => value + (data.processed ?? 0))
        const statusResponse = await fetch(`/api/guest-profiles/sync?propertyId=${property.id}`, { cache: 'no-store' })
        if (statusResponse.ok) setStatus(await statusResponse.json())
        if (data.state === 'complete') {
          toast.success('Bookings refreshed')
          router.refresh()
          return
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      toast.info('Refresh paused. Continue refresh to resume.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally { setPulling(false) }
  }

  async function guestLink(id:string,regenerate=false){setLinkBusy(id);try{if(regenerate){const revoked=await fetch(`/api/guest-profiles/${id}/link`,{method:'DELETE'});if(!revoked.ok)throw Error('Unable to revoke link')}const response=await fetch(`/api/guest-profiles/${id}/link`,{method:'POST'});const data=await response.json();if(!response.ok)throw Error(data.error??'Unable to issue link');setPrivateLink(data.url)}catch(error){toast.error(error instanceof Error?error.message:'Unable to issue link')}finally{setLinkBusy(null)}}

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              <PlugZap className={cn('size-4', testing && 'animate-pulse')} />
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
          )}
          <Button onClick={pull} disabled={pulling || property.oracleHotelId !== 'LO'}>
            <RefreshCw className={cn('size-4', pulling && 'animate-spin')} />
            {pulling ? 'Refreshing…' : status.state === 'running' ? 'Continue refresh' : 'Refresh bookings'}
          </Button>
        </div>
      </div>

      <Card><CardContent className="space-y-1 py-4 text-sm">
        <p>{status.lastSuccessAt ? `Last complete refresh: ${new Date(status.lastSuccessAt).toLocaleString()}` : 'Bookings have not been imported yet.'}</p>
        {status.fromDate && <p className="text-muted-foreground">Arrival coverage: {status.fromDate} to {status.toDate}; includes current in-house stays.</p>}
        {status.error && <p role="alert" className="text-destructive">{status.error}. The last complete bookings are retained.</p>}
        {pulling && <div role="status" className="flex items-center gap-3"><span>{progress} records processed</span><Button variant="outline" size="sm" onClick={() => { stopped.current = true }}>Pause refresh</Button></div>}
      </CardContent></Card>

      {property.oracleHotelId !== 'LO' && (
        <Card><CardContent className="py-4 text-sm text-amber-700">
          This release supports LO. Verify the Oracle hotel name before setting the Hotel ID in Property Settings.
        </CardContent></Card>
      )}

      {property.oracleHotelId==='LO'&&<div className="flex gap-2"><Button variant={tab==='bookings'?'default':'outline'} onClick={()=>setTab('bookings')}>Bookings</Button><Button variant={tab==='questions'?'default':'outline'} onClick={()=>setTab('questions')}>Questions</Button></div>}
      {privateLink&&<Card><CardContent className="space-y-3 py-4"><p className="text-sm">Private guest link · share only with this reservation’s guests</p><input readOnly aria-label="Private guest link" value={privateLink} className="w-full rounded-md border p-2 text-sm"/><div className="flex gap-3"><Button variant="outline" onClick={()=>{void navigator.clipboard.writeText(privateLink).then(()=>toast.success('Link copied')).catch(()=>toast.error('Select the link to copy it'))}}>Copy link</Button><Button variant="ghost" onClick={()=>setPrivateLink(null)}>Close</Button></div></CardContent></Card>}
      {reviewId&&<QuestionnaireReview key={reviewId} guestProfileId={reviewId} onClose={()=>setReviewId(null)}/>}
      {tab==='questions'?<QuestionBuilder propertyId={property.id} isAdmin={isAdmin}/>:profiles.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No guest profiles yet. Click &ldquo;Refresh bookings&rdquo; to import upcoming reservations.
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
                <TableHead>Stay</TableHead>
                <TableHead>Pre-arrival</TableHead>
                <TableHead>Guest link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.guestName ?? '—'}</TableCell>
                  <TableCell>{p.confirmationNumber ?? '—'}</TableCell>
                  <TableCell>{p.arrivalDate ?? '—'}</TableCell>
                  <TableCell>{p.roomNumber ?? p.roomType ?? '—'}</TableCell>
                  <TableCell>{p.stayState.replaceAll('_', ' ')}<span className="block text-xs text-muted-foreground">{p.oracleReservationStatus}</span></TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{p.questionnaireStatus.replaceAll('_',' ')}</span>
                    {p.questionnaireStatus!=='not_started'&&<Button variant="ghost" size="sm" onClick={()=>setReviewId(p.id)}>Review answers</Button>}
                  </TableCell>
                  <TableCell>{['reserved','in_house'].includes(p.stayState)&&<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={linkBusy===p.id} onClick={()=>void guestLink(p.id)}>Private link</Button><Button variant="ghost" size="sm" disabled={linkBusy===p.id} onClick={()=>void guestLink(p.id,true)}>Regenerate link</Button></div>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}
