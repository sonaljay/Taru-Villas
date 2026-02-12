'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreVertical, Pencil, Copy, Power, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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

interface TemplateActionsProps {
  templateId: string
  isActive: boolean
}

export function TemplateActions({ templateId, isActive }: TemplateActionsProps) {
  const router = useRouter()
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDuplicate() {
    setIsLoading(true)
    try {
      // Fetch the existing template
      const res = await fetch(`/api/templates/${templateId}`)
      if (!res.ok) throw new Error('Failed to fetch template')
      const template = await res.json()

      // Create a new template based on the existing one
      const createRes = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          categories: template.categories.map(
            (cat: { name: string; description?: string; weight: string; sortOrder: number; questions: { text: string; description?: string; scaleMin: number; scaleMax: number; isRequired: boolean; sortOrder: number }[] }) => ({
              name: cat.name,
              description: cat.description,
              weight: cat.weight,
              sortOrder: cat.sortOrder,
              questions: cat.questions.map(
                (q: { text: string; description?: string; scaleMin: number; scaleMax: number; isRequired: boolean; sortOrder: number }) => ({
                  text: q.text,
                  description: q.description,
                  scaleMin: q.scaleMin,
                  scaleMax: q.scaleMax,
                  isRequired: q.isRequired,
                  sortOrder: q.sortOrder,
                })
              ),
            })
          ),
        }),
      })

      if (!createRes.ok) throw new Error('Failed to duplicate template')

      toast.success('Template duplicated successfully')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to duplicate template'
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeactivate() {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to deactivate template')

      toast.success('Template deactivated')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to deactivate template'
      )
    } finally {
      setIsLoading(false)
      setShowDeactivateDialog(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/templates/${templateId}?hard=true`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete template')
      }

      toast.success('Template has been permanently deleted')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete template'
      )
    } finally {
      setIsDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={isLoading}>
            <MoreVertical className="size-4" />
            <span className="sr-only">Template actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/admin/templates/${templateId}`)}
          >
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDuplicate} disabled={isLoading}>
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setShowDeactivateDialog(true)}
              >
                <Power className="size-4" />
                Deactivate
              </DropdownMenuItem>
            </>
          )}
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

      <AlertDialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the template. It will no longer be available
              for new surveys. Existing submissions will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeactivate}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Permanently Alert Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this template and all its categories,
              questions, and associated survey submissions. This action cannot be
              undone.
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
