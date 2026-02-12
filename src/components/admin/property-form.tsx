'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Property } from '@/lib/db/schema'

const propertySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase letters, numbers, hyphens, or underscores'),
  slug: z.string().min(1, 'Slug is required').max(255),
  location: z.string().max(500).optional(),
  imageUrl: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
})

type PropertyFormValues = z.infer<typeof propertySchema>

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface PropertyFormProps {
  property?: Property | null
  onSuccess?: () => void
}

export function PropertyForm({ property, onSuccess }: PropertyFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!property

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PropertyFormValues>({
    defaultValues: {
      name: property?.name ?? '',
      code: property?.code ?? '',
      slug: property?.slug ?? '',
      location: property?.location ?? '',
      imageUrl: property?.imageUrl ?? '',
      isActive: property?.isActive ?? true,
    },
  })

  const nameValue = watch('name')
  const isActiveValue = watch('isActive')

  // Auto-generate slug from name (only if not editing)
  useEffect(() => {
    if (!isEditing && nameValue) {
      setValue('slug', generateSlug(nameValue))
    }
  }, [nameValue, isEditing, setValue])

  async function onSubmit(data: PropertyFormValues) {
    setIsSubmitting(true)
    try {
      const url = isEditing
        ? `/api/properties/${property.id}`
        : '/api/properties'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          imageUrl: data.imageUrl || null,
          location: data.location || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Something went wrong')
      }

      toast.success(isEditing ? 'Property updated' : 'Property created')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save property'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Property Name</Label>
        <Input
          id="name"
          placeholder="e.g. Taru Villas - Bentota"
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Code */}
      <div className="space-y-2">
        <Label htmlFor="code">Property Code</Label>
        <Input
          id="code"
          placeholder="e.g. TV-BEN"
          className="uppercase"
          {...register('code', {
            required: 'Code is required',
            pattern: {
              value: /^[A-Z0-9_-]+$/,
              message: 'Uppercase letters, numbers, hyphens, or underscores only',
            },
          })}
          onChange={(e) => {
            setValue('code', e.target.value.toUpperCase())
          }}
        />
        {errors.code && (
          <p className="text-sm text-destructive">{errors.code.message}</p>
        )}
      </div>

      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="slug">URL Slug</Label>
        <Input
          id="slug"
          placeholder="auto-generated-from-name"
          {...register('slug', { required: 'Slug is required' })}
          className="text-muted-foreground"
        />
        {errors.slug && (
          <p className="text-sm text-destructive">{errors.slug.message}</p>
        )}
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="e.g. Bentota, Sri Lanka"
          {...register('location')}
        />
      </div>

      {/* Image URL */}
      <div className="space-y-2">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          placeholder="https://example.com/image.png"
          {...register('imageUrl')}
        />
        {errors.imageUrl && (
          <p className="text-sm text-destructive">{errors.imageUrl.message}</p>
        )}
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="isActive" className="text-sm font-medium">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">
            Inactive properties are hidden from non-admin users
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
              : 'Create Property'}
        </Button>
      </div>
    </form>
  )
}
