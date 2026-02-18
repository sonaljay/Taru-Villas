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
import type { MenuCategory } from '@/lib/db/schema'

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(500),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

interface MenuCategoryFormProps {
  propertyId: string
  category?: MenuCategory | null
  onSuccess?: () => void
}

export function MenuCategoryForm({
  propertyId,
  category,
  onSuccess,
}: MenuCategoryFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!category

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      sortOrder: category?.sortOrder ?? 0,
      isActive: category?.isActive ?? true,
    },
  })

  const isActiveValue = watch('isActive')

  async function onSubmit(data: CategoryFormValues) {
    setIsSubmitting(true)
    try {
      const url = isEditing
        ? `/api/menus/categories/${category.id}`
        : '/api/menus/categories'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          description: data.description || null,
          ...(!isEditing && { propertyId }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Something went wrong')
      }

      toast.success(isEditing ? 'Category updated' : 'Category created')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save category'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g. Starters, Main Course, Desserts"
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Optional description for this category..."
          rows={2}
          {...register('description')}
        />
      </div>

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

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="isActive" className="text-sm font-medium">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">
            Inactive categories are hidden from the public page
          </p>
        </div>
        <Switch
          id="isActive"
          checked={isActiveValue}
          onCheckedChange={(checked) => setValue('isActive', checked)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Creating...'
            : isEditing
              ? 'Save Changes'
              : 'Create Category'}
        </Button>
      </div>
    </form>
  )
}
