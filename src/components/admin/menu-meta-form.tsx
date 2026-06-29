'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register, handleSubmit } = useForm<MetaValues>({
    defaultValues: {
      name: menu.name,
      priceNote: menu.priceNote ?? '',
      description: menu.description ?? '',
      footerNote: menu.footerNote ?? '',
    },
  })

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
      toast.success('Menu details saved')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register('name', { required: true })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="priceNote">Price note</Label>
        <Input id="priceNote" placeholder="$40 per person" {...register('priceNote')} />
        <p className="text-xs text-muted-foreground">
          On a set menu this is the prix-fixe price covering all courses that have
          no price of their own (shown under &ldquo;Three-Course Set Menu&rdquo;).
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Intro / description</Label>
        <Textarea id="description" rows={4} {...register('description')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footerNote">Footer note</Label>
        <Textarea id="footerNote" rows={2} {...register('footerNote')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Details'}
        </Button>
      </div>
    </form>
  )
}
