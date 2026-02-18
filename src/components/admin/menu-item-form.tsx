'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import type { MenuItem } from '@/lib/db/schema'

const itemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  imageUrl: z.string().optional().or(z.literal('')),
  price: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface MenuItemFormProps {
  categoryId: string
  item?: MenuItem | null
  onSuccess?: () => void
}

export function MenuItemForm({ categoryId, item, onSuccess }: MenuItemFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!item

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ItemFormValues>({
    defaultValues: {
      title: item?.title ?? '',
      description: item?.description ?? '',
      imageUrl: item?.imageUrl ?? '',
      price: item?.price ?? '',
      sortOrder: item?.sortOrder ?? 0,
      isActive: item?.isActive ?? true,
    },
  })

  const isActiveValue = watch('isActive')

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const value = tagInput.trim()
      if (value && !tags.includes(value)) {
        setTags([...tags, value])
      }
      setTagInput('')
    }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  async function onSubmit(data: ItemFormValues) {
    setIsSubmitting(true)
    try {
      const url = isEditing
        ? `/api/menus/items/${item.id}`
        : '/api/menus/items'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          price: data.price || null,
          tags,
          ...(!isEditing && { categoryId }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Something went wrong')
      }

      toast.success(isEditing ? 'Menu item updated' : 'Menu item created')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save menu item'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. Grilled Prawns"
          {...register('title', { required: 'Title is required' })}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe the dish..."
          rows={2}
          {...register('description')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          placeholder="https://example.com/image.jpg"
          {...register('imageUrl')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            placeholder="e.g. $12, LKR 2,500"
            {...register('price')}
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
        </div>
      </div>

      {/* Tags input */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
          onClick={() => tagInputRef.current?.focus()}
        >
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {tag}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(tag)
                }}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[120px]"
            placeholder={tags.length === 0 ? 'Type a tag and press Enter...' : ''}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Press Enter or comma to add. e.g. Spicy, Vegetarian, Chef&apos;s Special
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="isActive" className="text-sm font-medium">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">
            Inactive items are hidden from the public page
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
              : 'Create Item'}
        </Button>
      </div>
    </form>
  )
}
