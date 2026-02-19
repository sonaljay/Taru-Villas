'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, Save, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface CoverImageInputProps {
  propertyId: string
  fieldName: 'menuCoverImageUrl' | 'excursionCoverImageUrl'
  currentUrl: string | null
  label: string
}

export function CoverImageInput({
  propertyId,
  fieldName,
  currentUrl,
  label,
}: CoverImageInputProps) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl ?? '')
  const [saving, setSaving] = useState(false)

  const isDirty = url !== (currentUrl ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: url || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save')
      }
      toast.success('Cover image updated')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to clear')
      }
      setUrl('')
      toast.success('Cover image cleared')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Falls back to the property image if not set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/image.jpg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
          {currentUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClear}
              disabled={saving}
            >
              <X className="size-4" />
              Clear
            </Button>
          )}
        </div>
        {(url || currentUrl) && (
          <div className="relative h-32 overflow-hidden rounded-md border bg-muted">
            <img
              src={url || currentUrl!}
              alt="Cover preview"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
