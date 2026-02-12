'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProfileWithAssignments } from '@/lib/db/queries/profiles'
import type { Property } from '@/lib/db/schema'

interface UserEditFormValues {
  fullName: string
  role: 'admin' | 'property_manager' | 'staff'
  propertyIds: string[]
}

interface UserEditFormProps {
  user: ProfileWithAssignments
  properties: Property[]
  onSuccess?: () => void
}

export function UserEditForm({ user, properties, onSuccess }: UserEditFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserEditFormValues>({
    defaultValues: {
      fullName: user.fullName,
      role: user.role,
      propertyIds: user.assignments?.map((a) => a.propertyId) ?? [],
    },
  })

  const selectedRole = watch('role')
  const selectedPropertyIds = watch('propertyIds')

  function toggleProperty(propertyId: string) {
    const current = selectedPropertyIds || []
    if (current.includes(propertyId)) {
      setValue(
        'propertyIds',
        current.filter((id) => id !== propertyId)
      )
    } else {
      setValue('propertyIds', [...current, propertyId])
    }
  }

  async function onSubmit(data: UserEditFormValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update user')
      }

      toast.success('User updated successfully')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update user'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label>Email Address</Label>
        <Input value={user.email} disabled className="bg-muted" />
      </div>

      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="edit-fullName">Full Name</Label>
        <Input
          id="edit-fullName"
          {...register('fullName', { required: 'Full name is required' })}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      {/* Role */}
      <div className="space-y-2">
        <Label>Role</Label>
        <Select
          value={selectedRole}
          onValueChange={(value) =>
            setValue('role', value as UserEditFormValues['role'])
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="property_manager">Property Manager</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Property Assignments */}
      {selectedRole !== 'admin' && (
        <div className="space-y-2">
          <Label>Property Assignments</Label>
          <p className="text-xs text-muted-foreground">
            Select the properties this user can access
          </p>
          {properties.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              No properties available
            </p>
          ) : (
            <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
              {properties.map((property) => (
                <label
                  key={property.id}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPropertyIds?.includes(property.id) ?? false}
                    onChange={() => toggleProperty(property.id)}
                    className="size-4 rounded border-input accent-primary"
                  />
                  <span className="flex-1">{property.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {property.code}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  )
}
