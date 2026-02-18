'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { MoreHorizontal, Pencil, Power, MapPin, Trash2, Compass } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PropertyForm } from '@/components/admin/property-form'
import type { Property } from '@/lib/db/schema'
import type { OrgUser } from '@/components/admin/properties-page-client'

interface PropertyCardProps {
  property: Property
  allUsers?: OrgUser[]
}

export function PropertyCard({ property, allUsers = [] }: PropertyCardProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleToggleActive() {
    setIsToggling(true)
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !property.isActive }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update property')
      }

      toast.success(
        property.isActive ? 'Property deactivated' : 'Property activated'
      )
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update property'
      )
    } finally {
      setIsToggling(false)
      setDeactivateOpen(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/properties/${property.id}?hard=true`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete property')
      }

      toast.success(`${property.name} has been permanently deleted`)
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete property'
      )
    } finally {
      setIsDeleting(false)
      setDeleteOpen(false)
    }
  }

  // Look up PM name from allUsers
  const pmName = property.primaryPmId
    ? allUsers.find((u) => u.id === property.primaryPmId)?.fullName ?? 'Unknown'
    : null

  const imageSrc =
    property.imageUrl || `/properties/${property.code}.png`

  return (
    <>
      <Card className="group overflow-hidden py-0 gap-0">
        {/* Image */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
          <Image
            src={imageSrc}
            alt={property.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            <Badge
              variant={property.isActive ? 'default' : 'secondary'}
              className={
                property.isActive
                  ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                  : 'bg-zinc-500 hover:bg-zinc-500 text-white'
              }
            >
              {property.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          {/* Actions */}
          <div className="absolute top-3 right-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon-xs"
                  className="size-7 bg-white/90 hover:bg-white shadow-sm"
                >
                  <MoreHorizontal className="size-4 text-zinc-700" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/properties/${property.id}/excursions`}>
                    <Compass className="size-4" />
                    Manage Excursions
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant={property.isActive ? 'destructive' : 'default'}
                  onClick={() =>
                    property.isActive
                      ? setDeactivateOpen(true)
                      : handleToggleActive()
                  }
                >
                  <Power className="size-4" />
                  {property.isActive ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Delete permanently
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <CardContent className="space-y-2 p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight text-sm">
              {property.name}
            </h3>
            <Badge variant="outline" className="shrink-0 text-[11px] font-mono">
              {property.code}
            </Badge>
          </div>
          {property.location && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {property.location}
            </div>
          )}
          <div className="pt-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              PM:{' '}
            </span>
            <span className="text-xs">
              {pmName ?? 'Unassigned'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
            <DialogDescription>
              Update the details for {property.name}.
            </DialogDescription>
          </DialogHeader>
          <PropertyForm
            property={property}
            onSuccess={() => setEditOpen(false)}
            allUsers={allUsers}
            assignedUserIds={allUsers
              .filter((u) => u.assignedPropertyIds.includes(property.id))
              .map((u) => u.id)
            }
          />
        </DialogContent>
      </Dialog>

      {/* Deactivate Alert Dialog */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate{' '}
              <span className="font-medium text-foreground">
                {property.name}
              </span>
              ? This property will be hidden from non-admin users. You can
              reactivate it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleToggleActive}
              disabled={isToggling}
            >
              {isToggling ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Permanently Alert Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">
                {property.name}
              </span>{' '}
              and all its assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
