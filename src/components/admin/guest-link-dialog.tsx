'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Link as LinkIcon, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface Property {
  id: string
  name: string
}

interface GuestLinkDialogProps {
  templateId: string
  templateName: string
  properties: Property[]
}

export function GuestLinkDialog({
  templateId,
  templateName,
  properties,
}: GuestLinkDialogProps) {
  const [open, setOpen] = useState(false)
  const [propertyId, setPropertyId] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [linkData, setLinkData] = useState<{
    id: string
    token: string
    link: string
    isActive: boolean
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setPropertyId('')
      setLinkData(null)
      setCopied(false)
    }
  }, [open])

  async function handleGenerate() {
    if (!propertyId) {
      toast.error('Please select a property')
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch('/api/admin/guest-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, propertyId }),
      })
      if (!res.ok) throw new Error('Failed to generate link')
      const data = await res.json()
      setLinkData(data)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate link'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleCopy() {
    if (!linkData) return
    await navigator.clipboard.writeText(linkData.link)
    setCopied(true)
    toast.success('Link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleToggle(active: boolean) {
    if (!linkData) return
    setIsToggling(true)
    try {
      const res = await fetch(`/api/admin/guest-links/${linkData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: active }),
      })
      if (!res.ok) throw new Error('Failed to update link')
      setLinkData({ ...linkData, isActive: active })
      toast.success(active ? 'Link activated' : 'Link deactivated')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update link'
      )
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LinkIcon className="size-4" />
          Guest Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Guest Survey Link</DialogTitle>
          <DialogDescription>
            Generate a shareable link for &quot;{templateName}&quot; that guests
            can use without logging in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Property selector */}
          <div className="space-y-1.5">
            <Label>Property</Label>
            <Select
              value={propertyId}
              onValueChange={(val) => {
                setPropertyId(val)
                setLinkData(null)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate button */}
          {!linkData && (
            <Button
              onClick={handleGenerate}
              disabled={!propertyId || isGenerating}
              className="w-full"
            >
              {isGenerating && <Loader2 className="size-4 animate-spin" />}
              Generate Link
            </Button>
          )}

          {/* Link display */}
          {linkData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm truncate">
                  {linkData.link}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Link active</p>
                  <p className="text-xs text-muted-foreground">
                    {linkData.isActive
                      ? 'Guests can access this survey'
                      : 'Link is disabled — guests will see an error'}
                  </p>
                </div>
                <Switch
                  checked={linkData.isActive}
                  onCheckedChange={handleToggle}
                  disabled={isToggling}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
