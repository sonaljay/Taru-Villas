'use client'

import { useState, useEffect } from 'react'
import { Settings2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Band {
  minGuests: number
  targetUnits: number
}

interface KpiBandsFormProps {
  propertyId: string
  utilityType: 'water' | 'electricity'
  onRefresh: () => void
}

const DEFAULT_BANDS_BY_UTILITY: Record<'water' | 'electricity', Band[]> = {
  electricity: [
    { minGuests: 0, targetUnits: 224 }, { minGuests: 1, targetUnits: 305 }, { minGuests: 6, targetUnits: 331 },
    { minGuests: 11, targetUnits: 390 }, { minGuests: 16, targetUnits: 434 }, { minGuests: 21, targetUnits: 483 },
    { minGuests: 26, targetUnits: 501 },
  ],
  water: [
    { minGuests: 0, targetUnits: 7 }, { minGuests: 1, targetUnits: 10 }, { minGuests: 6, targetUnits: 10 },
    { minGuests: 11, targetUnits: 11 }, { minGuests: 16, targetUnits: 11 }, { minGuests: 21, targetUnits: 11 },
    { minGuests: 26, targetUnits: 4 },
  ],
}

export function UtilityKpiBandsForm({ propertyId, utilityType, onRefresh }: KpiBandsFormProps) {
  const [bands, setBands] = useState<Band[]>([])
  const [editBands, setEditBands] = useState<Band[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const unit = utilityType === 'water' ? 'm³' : 'kWh'
  const label = utilityType === 'water' ? 'Water' : 'Electricity'

  useEffect(() => {
    fetchBands()
  }, [propertyId, utilityType])

  async function fetchBands() {
    setLoading(true)
    try {
      const res = await fetch(`/api/utilities/kpi-bands?propertyId=${propertyId}&utilityType=${utilityType}`)
      if (res.ok) {
        const data = await res.json()
        setBands(
          data.map((b: { minGuests: number; targetUnits: string }) => ({
            minGuests: b.minGuests,
            targetUnits: parseFloat(b.targetUnits),
          }))
        )
      }
    } catch (error) {
      console.error('Failed to fetch bands:', error)
    } finally {
      setLoading(false)
    }
  }

  function openEdit() {
    setEditBands(bands.length > 0 ? [...bands] : [...DEFAULT_BANDS_BY_UTILITY[utilityType]])
    setShowDialog(true)
  }

  function updateBand(index: number, field: keyof Band, value: string) {
    setEditBands((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        [field]: field === 'minGuests' ? parseInt(value) || 0 : parseFloat(value) || 0,
      }
      return updated
    })
  }

  function addBand() {
    setEditBands((prev) => [...prev, { minGuests: 0, targetUnits: 0 }])
  }

  function removeBand(index: number) {
    setEditBands((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    // Sort + dedupe-check before submit
    const sorted = [...editBands].sort((a, b) => a.minGuests - b.minGuests)
    const thresholds = sorted.map((b) => b.minGuests)
    if (new Set(thresholds).size !== thresholds.length) {
      toast.error('Guest-count thresholds must be unique')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/kpi-bands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, utilityType, bands: sorted }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save bands')
      }
      toast.success('KPI bands updated')
      setShowDialog(false)
      await fetchBands()
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {`${label} KPI Bands (${unit} by guest count)`}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Settings2 className="size-4" />
            {bands.length > 0 ? 'Edit Bands' : 'Set Up Bands'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : bands.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guests (from)</TableHead>
                    <TableHead className="text-right">{`Daily target (${unit})`}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bands.map((band) => (
                    <TableRow key={band.minGuests}>
                      <TableCell className="font-medium">{band.minGuests}+</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {band.targetUnits.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {`No KPI bands configured. Set up bands to track ${label.toLowerCase()} KPI achievement.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{`Edit ${label} KPI Bands`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editBands.map((band, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Guests from</Label>
                  <Input
                    type="number" min="0"
                    value={band.minGuests}
                    onChange={(e) => updateBand(index, 'minGuests', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{`Target (${unit})`}</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={band.targetUnits}
                    onChange={(e) => updateBand(index, 'targetUnits', e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => removeBand(index)}
                  disabled={editBands.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addBand}>
              <Plus className="size-4" /> Add Band
            </Button>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Bands'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
