'use client'

import { useSaveProtection, usePortalRouter, useUnsavedChanges } from '@/hooks/use-unsaved-changes'

import { Field } from '@/components/ui/field'

import { useState, useEffect } from 'react'

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
import type { Property } from '@/lib/db/schema'
import { validateInviteEmail } from '@/lib/auth/invitations'

interface UserInviteFormValues {
  email: string
  fullName: string
  role: 'admin' | 'property_manager' | 'staff'
  propertyIds: string[]
}

interface UserInviteFormProps {
  onSuccess?: () => void
}

export function UserInviteForm({ onSuccess }: UserInviteFormProps) {
  const router = usePortalRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const releaseSaveProtection = useSaveProtection(isSubmitting)

  const [properties, setProperties] = useState<Property[]>([])
  const [loadingProperties, setLoadingProperties] = useState(true)

  const { reset, getValues,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors , isDirty },
  } = useForm<UserInviteFormValues>({
    defaultValues: {
      email: '',
      fullName: '',
      role: 'staff',
      propertyIds: [],
    },
  })
  const [submitError, setSubmitError] = useState('')
  const { markSaved } = useUnsavedChanges(isDirty)

  const selectedRole = watch('role')
  const selectedPropertyIds = watch('propertyIds')

  // Fetch properties for assignment checkboxes
  useEffect(() => {
    async function fetchProperties() {
      try {
        const res = await fetch('/api/properties')
        if (res.ok) {
          const data = await res.json()
          setProperties(data)
        }
      } catch {
        console.error('Failed to fetch properties')
      } finally {
        setLoadingProperties(false)
      }
    }
    fetchProperties()
  }, [])

  function toggleProperty(propertyId: string) {
    const current = selectedPropertyIds || []
    if (current.includes(propertyId)) {
      setValue(
        'propertyIds',
        current.filter((id) => id !== propertyId), { shouldDirty: true }
      )
    } else {
      setValue('propertyIds', [...current, propertyId], { shouldDirty: true })
    }
  }

  async function onSubmit(data: UserInviteFormValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to invite user')
      }

      reset(getValues()); releaseSaveProtection(); markSaved(); setSubmitError('')
      toast.success('User invited successfully')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to invite user')
      toast.error(
        error instanceof Error ? error.message : 'Failed to invite user'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => setSubmitError('Check the highlighted details before saving.'))} className="space-y-5"><fieldset disabled={isSubmitting} className="contents">
      {submitError && <p role="alert" className="portal-form-errors rounded-xl border border-destructive/40 p-4">{submitError}</p>}
      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input disabled={isSubmitting} aria-invalid={!!errors.email}
          id="email"
          type="email"
          placeholder="manager@client.example"
          {...register('email', {
            required: 'Email is required',
            validate: validateInviteEmail,
          })}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input disabled={isSubmitting} aria-invalid={!!errors.fullName}
          id="fullName"
          placeholder="John Doe"
          {...register('fullName', { required: 'Full name is required' })}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      {/* Role */}
      <Field className="space-y-2">
        <Label>Role</Label>
        <Select disabled={isSubmitting}
          value={selectedRole}
          onValueChange={(value) =>
            setValue('role', value as UserInviteFormValues['role'], { shouldDirty: true })
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
      </Field>

      {/* Property Assignments */}
      {selectedRole !== 'admin' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Property Assignments</legend>
          <p className="text-xs text-muted-foreground">
            Select the properties this user can access
          </p>
          {loadingProperties ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading properties...
            </div>
          ) : properties.length === 0 ? (
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
        </fieldset>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Sending Invite...
            </>
          ) : (
            'Send Invite'
          )}
        </Button>
      </div>
    </fieldset></form>
  )
}
