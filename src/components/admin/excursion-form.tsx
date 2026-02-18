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
  description: z.string().max(5000).optional(),
  imageUrl: z.string().optional().or(z.literal('')),
  price: z.string().max(100).optional(),
  duration: z.string().max(100).optional(),
  bookingUrl: z.string().optional().or(z.literal('')),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
})

type ExcursionFormValues = z.infer<typeof excursionSchema>

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
      imageUrl: excursion?.imageUrl ?? '',
      price: excursion?.price ?? '',
      duration: excursion?.duration ?? '',
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

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          price: data.price || null,
          duration: data.duration || null,
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
          rows={3}
          {...register('description')}
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
