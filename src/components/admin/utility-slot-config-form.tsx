'use client'

import { useSaveProtection, useUnsavedChanges } from '@/hooks/use-unsaved-changes'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SlotConfigFormProps {
  onRefresh: () => void
}

export function UtilitySlotConfigForm({ onRefresh }: SlotConfigFormProps) {
  const [morning, setMorning] = useState('05:30')
  const [evening, setEvening] = useState('17:30')
  const [night, setNight] = useState('22:30')
  const [savedTimes, setSavedTimes] = useState(JSON.stringify(['05:30', '17:30', '22:30']))
  const currentTimes = JSON.stringify([morning, evening, night])
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const releaseSaveProtection = useSaveProtection(isSaving)

  const { markSaved } = useUnsavedChanges(!loading && currentTimes !== savedTimes)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/utilities/slot-config')
        if (res.ok) {
          const d = await res.json()
          if (d.morningTime) setMorning(d.morningTime.slice(0, 5))
          if (d.eveningTime) setEvening(d.eveningTime.slice(0, 5))
          if (d.nightTime) setNight(d.nightTime.slice(0, 5))
          setSavedTimes(JSON.stringify([d.morningTime?.slice(0, 5) ?? '05:30', d.eveningTime?.slice(0, 5) ?? '17:30', d.nightTime?.slice(0, 5) ?? '22:30']))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/slot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ morningTime: morning, eveningTime: evening, nightTime: night }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save slot times')
      }
      setSavedTimes(currentTimes); releaseSaveProtection(); markSaved(); setSaveError('')
      toast.success('Slot times updated')
      onRefresh()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save times')
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="size-4" />
          Electricity Reading Times (org-wide)
        </CardTitle>
      </CardHeader>
      <CardContent>
      {saveError && <p role="alert" className="rounded-xl border border-destructive/40 p-4">{saveError}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="slot-morning">Morning</Label>
            <Input id="slot-morning" type="time" className="w-32" value={morning}
              onChange={(e) => setMorning(e.target.value)} disabled={isSaving || (loading)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-evening">Evening</Label>
            <Input id="slot-evening" type="time" className="w-32" value={evening}
              onChange={(e) => setEvening(e.target.value)} disabled={isSaving || (loading)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-night">Night</Label>
            <Input id="slot-night" type="time" className="w-32" value={night}
              onChange={(e) => setNight(e.target.value)} disabled={isSaving || (loading)} />
          </div>
          <Button onClick={handleSave} disabled={isSaving || loading}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
