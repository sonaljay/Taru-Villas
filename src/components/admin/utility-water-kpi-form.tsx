'use client'

import { useState, useEffect } from 'react'
import { Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WaterKpiFormProps {
  propertyId: string
  onRefresh: () => void
}

export function UtilityWaterKpiForm({ propertyId, onRefresh }: WaterKpiFormProps) {
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/utilities/kpis?propertyId=${propertyId}`)
        if (res.ok) {
          const data = await res.json()
          if (data?.dailyTargetUnits) setTarget(String(parseFloat(data.dailyTargetUnits)))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [propertyId])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/kpis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, dailyTargetUnits: parseFloat(target) || 0 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save target')
      }
      toast.success('Water KPI target updated')
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="size-4" />
          Water KPI (daily target)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="water-target">Daily target (units)</Label>
            <Input
              id="water-target" type="number" min="0" step="0.01"
              className="w-40"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={loading}
              placeholder="e.g. 5"
            />
          </div>
          <Button onClick={handleSave} disabled={isSaving || loading}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
