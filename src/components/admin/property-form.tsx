'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, User } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export interface AssignableUser {
  id: string
  fullName: string
  role: string
}

interface PropertyFormProps {
  property?: Property | null
  onSuccess?: () => void
  /** All org users available for assignment (edit mode only) */
  allUsers?: AssignableUser[]
  /** Currently assigned user IDs for this property */
  assignedUserIds?: string[]
}

export function PropertyForm({
  property,
  onSuccess,
  allUsers = [],
  assignedUserIds: initialAssignedIds = [],
}: PropertyFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(initialAssignedIds)
  )
  const [primaryPmId, setPrimaryPmId] = useState<string | null>(
    property?.primaryPmId ?? null
  )
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

  // Auto-include PM in assigned users when PM changes
  useEffect(() => {
    if (primaryPmId) {
      setSelectedUserIds((prev) => {
        if (prev.has(primaryPmId)) return prev
        const next = new Set(prev)
        next.add(primaryPmId)
        return next
      })
    }
  }, [primaryPmId])

  function toggleUser(userId: string) {
    // Prevent unchecking the current PM
    if (userId === primaryPmId) return
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

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
          ...(isEditing && {
            assignedUserIds: Array.from(selectedUserIds),
            primaryPmId,
          }),
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

      {/* Property Manager (edit mode only) */}
      {isEditing && allUsers.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium">Property Manager</Label>
            <p className="text-xs text-muted-foreground">
              Select the primary manager for this property
            </p>
            <Select
              value={primaryPmId ?? 'none'}
              onValueChange={(val) => setPrimaryPmId(val === 'none' ? null : val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {allUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName}
                    <span className="ml-1 text-muted-foreground text-xs">
                      ({formatRole(user.role)})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Assigned Users (edit mode only) */}
      {isEditing && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Assigned Users</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select users who can access and survey this property
              </p>
            </div>
            {allUsers.length > 0 ? (
              <>
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {allUsers.map((user) => {
                    const isSelected = selectedUserIds.has(user.id)
                    const isPM = user.id === primaryPmId
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                          isSelected && 'bg-primary/5',
                          isPM && 'cursor-default'
                        )}
                      >
                        <div
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-muted-foreground/30'
                          )}
                        >
                          {isSelected && <Check className="size-3" />}
                        </div>
                        <User className="size-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {user.fullName}
                            {isPM && (
                              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                                (PM)
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {formatRole(user.role)}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} assigned
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No users available. Add users in the Users page first.
              </p>
            )}
          </div>
        </>
      )}

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
