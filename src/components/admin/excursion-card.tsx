'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Power, Trash2, Clock, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { ExcursionForm } from '@/components/admin/excursion-form'
import type { Excursion } from '@/lib/db/schema'

interface ExcursionCardProps {
  excursion: Excursion
  propertyId: string
}

export function ExcursionCard({ excursion, propertyId }: ExcursionCardProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleToggleActive() {
    setIsToggling(true)
    try {
      const res = await fetch(`/api/excursions/${excursion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !excursion.isActive }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update excursion')
      }

      toast.success(
        excursion.isActive ? 'Excursion deactivated' : 'Excursion activated'
      )
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update excursion'
      )
    } finally {
      setIsToggling(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/excursions/${excursion.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete excursion')
      }

      toast.success('Excursion deleted')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete excursion'
      )
    } finally {
      setIsDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <>
      <Card className="group overflow-hidden py-0 gap-0">
        {/* Image */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
          {excursion.imageUrl ? (
            <img
              src={excursion.imageUrl}
              alt={excursion.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-200 dark:from-emerald-900/30 dark:to-teal-800/30">
              <span className="text-3xl">🏄</span>
            </div>
          )}
          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            <Badge
              variant={excursion.isActive ? 'default' : 'secondary'}
              className={
                excursion.isActive
                  ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                  : 'bg-zinc-500 hover:bg-zinc-500 text-white'
              }
            >
              {excursion.isActive ? 'Active' : 'Inactive'}
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant={excursion.isActive ? 'destructive' : 'default'}
                  onClick={handleToggleActive}
                  disabled={isToggling}
                >
                  <Power className="size-4" />
                  {excursion.isActive ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <CardContent className="space-y-2 p-5">
          <h3 className="font-semibold leading-tight text-sm line-clamp-1">
            {excursion.title}
          </h3>
          {excursion.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {excursion.description}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            {excursion.price && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DollarSign className="size-3 shrink-0" />
                {excursion.price}
              </div>
            )}
            {excursion.duration && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3 shrink-0" />
                {excursion.duration}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Excursion</DialogTitle>
            <DialogDescription>
              Update the details for {excursion.title}.
            </DialogDescription>
          </DialogHeader>
          <ExcursionForm
            propertyId={propertyId}
            excursion={excursion}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Excursion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">
                {excursion.title}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
