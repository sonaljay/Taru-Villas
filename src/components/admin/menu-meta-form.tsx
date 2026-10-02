'use client'

import { useSaveProtection, usePortalRouter, useUnsavedChanges } from '@/hooks/use-unsaved-changes'

import { useState } from 'react'

import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Menu } from '@/lib/db/schema'

interface MenuMetaFormProps {
  menu: Menu
  onSuccess?: () => void
}

interface MetaValues {
  name: string
  priceNote: string
  description: string
  footerNote: string
}

export function MenuMetaForm({ menu, onSuccess }: MenuMetaFormProps) {
  const router = usePortalRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const releaseSaveProtection = useSaveProtection(isSubmitting)

  const { reset, getValues, formState: { errors, isDirty }, register, handleSubmit } = useForm<MetaValues>({
    defaultValues: {
      name: menu.name,
      priceNote: menu.priceNote ?? '',
      description: menu.description ?? '',
      footerNote: menu.footerNote ?? '',
    },
  })
  const [submitError, setSubmitError] = useState('')
  const { markSaved } = useUnsavedChanges(isDirty)

  async function onSubmit(data: MetaValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/menus/${menu.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          priceNote: data.priceNote || null,
          description: data.description || null,
          footerNote: data.footerNote || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save')
      }
      reset(getValues()); releaseSaveProtection(); markSaved(); setSubmitError('')
      toast.success('Menu details saved')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save')
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, () => setSubmitError('Check the highlighted details before saving.'))} className="space-y-4"><fieldset disabled={isSubmitting} className="contents">
      {submitError && <p role="alert" className="portal-form-errors rounded-xl border border-destructive/40 p-4">{submitError}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input disabled={isSubmitting} aria-invalid={!!errors.name} id="name" {...register('name', { required: true })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="priceNote">Price note</Label>
        <Input disabled={isSubmitting} aria-invalid={!!errors.priceNote} id="priceNote" placeholder="$40 per person" {...register('priceNote')} />
        <p className="text-xs text-muted-foreground">
          On a set menu this is the prix-fixe price covering all courses that have
          no price of their own (shown under &ldquo;Three-Course Set Menu&rdquo;).
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Intro / description</Label>
        <Textarea disabled={isSubmitting} aria-invalid={!!errors.description} id="description" rows={4} {...register('description')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footerNote">Footer note</Label>
        <Textarea disabled={isSubmitting} aria-invalid={!!errors.footerNote} id="footerNote" rows={2} {...register('footerNote')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Details'}
        </Button>
      </div>
    </fieldset></form>
  )
}
