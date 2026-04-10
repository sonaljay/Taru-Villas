'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface AllowedEmailEntry {
  id: string
  email: string
  addedBy: string | null
  addedByName: string | null
  createdAt: string
}

interface AllowedEmailsPageClientProps {
  emails: AllowedEmailEntry[]
}

export function AllowedEmailsPageClient({ emails }: AllowedEmailsPageClientProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState<AllowedEmailEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filtered = emails.filter((e) =>
    e.email.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setIsAdding(true)
    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to add email')
      }

      toast.success('Email added to whitelist')
      setNewEmail('')
      setShowAddDialog(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add email')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete() {
    if (!deleteEmail) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/allowed-emails/${deleteEmail.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to remove email')
      }

      toast.success('Email removed from whitelist')
      setDeleteEmail(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Allowed Emails</h1>
          <p className="text-sm text-muted-foreground">
            Manage which email addresses can sign up for the platform.
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="size-4" />
          Add Email
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search emails..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Added By</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.addedByName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteEmail(entry)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Mail className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No allowed emails yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add email addresses to allow users to sign up.
          </p>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" />
            Add First Email
          </Button>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Allowed Email</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-email">Email Address</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="user@taruvillas.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isAdding}>
                {isAdding ? 'Adding...' : 'Add Email'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEmail} onOpenChange={(o: boolean) => !o && setDeleteEmail(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteEmail?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This person will no longer be able to sign up. Existing accounts are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
