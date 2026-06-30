'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { Excursion } from '@/lib/db/schema'

const excursionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(8000).optional(),
  experience: z.string().max(8000).optional(),
  whatsIncluded: z.string().max(8000).optional(),
  imageUrl: z.string().optional().or(z.literal('')),
  price: z.string().max(300).optional(),
  duration: z.string().max(100).optional(),
  tagsText: z.string().max(500).optional(),
  locationsText: z.string().max(5000).optional(),
  bookingUrl: z.string().optional().or(z.literal('')),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
})

type ExcursionFormValues = z.infer<typeof excursionSchema>

// Locations are edited as one per line in the form, "Name | https://map-url".
function serializeLocations(
  locations: { name: string; mapUrl?: string | null }[] | null | undefined
): string {
  if (!locations || locations.length === 0) return ''
  return locations
    .map((l) => (l.mapUrl ? `${l.name} | ${l.mapUrl}` : l.name))
    .join('\n')
}

function parseLocations(text: string): { name: string; mapUrl: string | null }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, ...urlParts] = line.split('|')
      const mapUrl = urlParts.join('|').trim()
      return { name: namePart.trim(), mapUrl: mapUrl || null }
    })
    .filter((l) => l.name.length > 0)
}

interface ExcursionFormProps {
  propertyId: string
  excursion?: Excursion | null
  onSuccess?: () => void
}

export function ExcursionForm({ propertyId, excursion, onSuccess }: ExcursionFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!excursion

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExcursionFormValues>({
    defaultValues: {
      title: excursion?.title ?? '',
      description: excursion?.description ?? '',
      experience: excursion?.experience ?? '',
      whatsIncluded: excursion?.whatsIncluded ?? '',
      imageUrl: excursion?.imageUrl ?? '',
      price: excursion?.price ?? '',
      duration: excursion?.duration ?? '',
      tagsText: (excursion?.tags ?? []).join(', '),
      locationsText: serializeLocations(excursion?.locations),
      bookingUrl: excursion?.bookingUrl ?? '',
      sortOrder: excursion?.sortOrder ?? 0,
      isActive: excursion?.isActive ?? true,
    },
  })

  const isActiveValue = watch('isActive')

  async function onSubmit(data: ExcursionFormValues) {
    setIsSubmitting(true)
    try {
      const url = isEditing
        ? `/api/excursions/${excursion.id}`
        : '/api/excursions'
      const method = isEditing ? 'PATCH' : 'POST'

      const tags = (data.tagsText ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const locations = parseLocations(data.locationsText ?? '')

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          description: data.description || null,
          experience: data.experience || null,
          whatsIncluded: data.whatsIncluded || null,
          imageUrl: data.imageUrl || null,
          price: data.price || null,
          duration: data.duration || null,
          tags,
          locations,
          bookingUrl: data.bookingUrl || null,
          ...(!isEditing && { propertyId }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Something went wrong')
      }

      toast.success(isEditing ? 'Excursion updated' : 'Excursion created')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save excursion'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. Whale Watching Tour"
          {...register('title', { required: 'Title is required' })}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe the excursion..."
          rows={4}
          {...register('description')}
        />
      </div>

      {/* Experience */}
      <div className="space-y-2">
        <Label htmlFor="experience">Experience</Label>
        <Textarea
          id="experience"
          placeholder="What the experience entails — itinerary, choices, duration options..."
          rows={4}
          {...register('experience')}
        />
        <p className="text-xs text-muted-foreground">
          Line breaks are preserved on the public page
        </p>
      </div>

      {/* What's included */}
      <div className="space-y-2">
        <Label htmlFor="whatsIncluded">What&rsquo;s included</Label>
        <Textarea
          id="whatsIncluded"
          placeholder="Transport, guide, equipment, refreshments..."
          rows={4}
          {...register('whatsIncluded')}
        />
      </div>

      {/* Image URL */}
      <div className="space-y-2">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          placeholder="https://example.com/image.jpg"
          {...register('imageUrl')}
        />
      </div>

      {/* Price + Duration */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            placeholder="e.g. $50, From $25 pp"
            {...register('price')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duration</Label>
          <Input
            id="duration"
            placeholder="e.g. 2 hours, Half day"
            {...register('duration')}
          />
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor="tagsText">Activity tags</Label>
        <Input
          id="tagsText"
          placeholder="Culture, Nature, Adventure"
          {...register('tagsText')}
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated, e.g. Culture, Nature, Wildlife, Adventure, Wellness, Community
        </p>
      </div>

      {/* Locations */}
      <div className="space-y-2">
        <Label htmlFor="locationsText">Locations</Label>
        <Textarea
          id="locationsText"
          placeholder={'Lunuganga Estate Gardens | https://maps.app.goo.gl/...\nBrief Gardens | https://maps.app.goo.gl/...'}
          rows={3}
          {...register('locationsText')}
        />
        <p className="text-xs text-muted-foreground">
          One per line — <code>Name | map URL</code> (the map URL is optional)
        </p>
      </div>

      {/* Booking URL */}
      <div className="space-y-2">
        <Label htmlFor="bookingUrl">Booking URL</Label>
        <Input
          id="bookingUrl"
          placeholder="https://wa.me/94... or booking link"
          {...register('bookingUrl')}
        />
        <p className="text-xs text-muted-foreground">
          WhatsApp links (wa.me) or any booking URL
        </p>
      </div>

      {/* Sort Order */}
      <div className="space-y-2">
        <Label htmlFor="sortOrder">Sort Order</Label>
        <Input
          id="sortOrder"
          type="number"
          min={0}
          {...register('sortOrder', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">
          Lower numbers appear first
        </p>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="isActive" className="text-sm font-medium">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">
            Inactive excursions are hidden from the public page
          </p>
        </div>
        <Switch
          id="isActive"
          checked={isActiveValue}
          onCheckedChange={(checked) => setValue('isActive', checked)}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Creating...'
            : isEditing
              ? 'Save Changes'
              : 'Create Excursion'}
        </Button>
      </div>
    </form>
  )
}
