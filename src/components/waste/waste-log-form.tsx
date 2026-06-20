'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WASTE_CATEGORIES, type WasteCategoryKey } from '@/lib/waste/categories'

interface WasteLogEntry {
  id: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
}

interface WasteLogFormProps {
  propertyId: string
  initialData?: WasteLogEntry | null
  onSuccess: () => void
  onCancel?: () => void
}

type KgState = Record<WasteCategoryKey, string>

function emptyKg(): KgState {
  return {
    paperKg: '',
    glassKg: '',
    plasticKg: '',
    foodKg: '',
    metalKg: '',
    electronicKg: '',
  }
}

export function WasteLogForm({ propertyId, initialData, onSuccess, onCancel }: WasteLogFormProps) {
  const today = new Date().toISOString().split('T')[0]
  const isEditing = !!initialData

  const [logDate, setLogDate] = useState(initialData?.logDate ?? today)
  const [kg, setKg] = useState<KgState>(
    initialData
      ? {
          paperKg: initialData.paperKg,
          glassKg: initialData.glassKg,
          plasticKg: initialData.plasticKg,
          foodKg: initialData.foodKg,
          metalKg: initialData.metalKg,
          electronicKg: initialData.electronicKg,
        }
      : emptyKg()
  )
  const [note, setNote] = useState(initialData?.note ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function setField(key: WasteCategoryKey, value: string) {
    setKg((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const numeric: Record<WasteCategoryKey, number> = emptyKg() as unknown as Record<WasteCategoryKey, number>
    for (const { key } of WASTE_CATEGORIES) {
      const raw = kg[key].trim()
      const n = raw === '' ? 0 : parseFloat(raw)
      if (isNaN(n) || n < 0) {
        toast.error('Enter valid non-negative kg values')
        return
      }
      numeric[key] = n
    }

    setIsSubmitting(true)
    try {
      const url = isEditing ? `/api/waste/${initialData!.id}` : '/api/waste'
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          logDate,
          ...numeric,
          note: note || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save')
      }

      toast.success(isEditing ? 'Waste log updated' : 'Waste log saved')
      if (!isEditing) {
        setKg(emptyKg())
        setNote('')
      }
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="waste-date">Date</Label>
        <Input
          id="waste-date"
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {WASTE_CATEGORIES.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <Label htmlFor={`waste-${c.key}`}>{c.label} (kg)</Label>
            <Input
              id={`waste-${c.key}`}
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={kg[c.key]}
              onChange={(e) => setField(c.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="waste-note">Note (optional)</Label>
        <Textarea
          id="waste-note"
          placeholder="Any observations..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Saving...'
            : isEditing
              ? 'Save Changes'
              : 'Save Entry'}
        </Button>
      </div>
    </form>
  )
}
