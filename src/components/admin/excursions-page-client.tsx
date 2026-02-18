'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Compass, Link2, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExcursionForm } from '@/components/admin/excursion-form'
import { ExcursionCard } from '@/components/admin/excursion-card'
import type { Property, Excursion } from '@/lib/db/schema'

interface ExcursionsPageClientProps {
  property: Property
  excursions: Excursion[]
}

export function ExcursionsPageClient({
  property,
  excursions,
}: ExcursionsPageClientProps) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  function copyPublicLink() {
    const url = `${window.location.origin}/e/${property.slug}`
    navigator.clipboard.writeText(url)
    toast.success('Public link copied to clipboard')
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/admin/properties')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Excursions
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage excursions for {property.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyPublicLink}>
            <Link2 className="size-4" />
            Copy Public Link
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add Excursion
          </Button>
        </div>
      </div>

      {/* Grid */}
      {excursions.length > 0 ? (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {excursions.map((excursion) => (
            <ExcursionCard
              key={excursion.id}
              excursion={excursion}
              propertyId={property.id}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Compass className="size-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">No excursions yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get started by adding the first excursion for this property.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            variant="outline"
            className="mt-4"
          >
            <Plus className="size-4" />
            Add Excursion
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Excursion</DialogTitle>
            <DialogDescription>
              Create a new excursion for {property.name}.
            </DialogDescription>
          </DialogHeader>
          <ExcursionForm
            propertyId={property.id}
            onSuccess={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
