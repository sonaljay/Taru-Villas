'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WASTE_CATEGORIES } from '@/lib/waste/categories'
import { WasteLogForm } from './waste-log-form'

interface WasteLogEntry {
  id: string
  propertyId: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
  recordedBy: string | null
  recorderName: string | null
  createdAt: string
  updatedAt: string
}

interface WasteLogTableProps {
  logs: WasteLogEntry[]
  propertyId: string
  onRefresh: () => void
}

function rowTotal(log: WasteLogEntry) {
  return WASTE_CATEGORIES.reduce((sum, c) => sum + parseFloat(log[c.key] || '0'), 0)
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function WasteLogTable({ logs, propertyId, onRefresh }: WasteLogTableProps) {
  const [deleteLog, setDeleteLog] = useState<WasteLogEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editLog, setEditLog] = useState<WasteLogEntry | null>(null)

  // Newest first
  const displayLogs = [...logs].reverse()

  async function handleDelete() {
    if (!deleteLog) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/waste/${deleteLog.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Waste log deleted')
      setDeleteLog(null)
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Log</CardTitle>
        </CardHeader>
        <CardContent>
          {displayLogs.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {WASTE_CATEGORIES.map((c) => (
                      <TableHead key={c.key} className="text-right">
                        {c.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{formatDate(log.logDate)}</TableCell>
                      {WASTE_CATEGORIES.map((c) => (
                        <TableCell key={c.key} className="text-right tabular-nums">
                          {parseFloat(log[c.key] || '0').toFixed(1)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-semibold">
                        {rowTotal(log).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.recorderName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditLog(log)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setDeleteLog(log)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No waste logged for this month.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editLog} onOpenChange={(open) => !open && setEditLog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Entry — {editLog && formatDate(editLog.logDate)}</DialogTitle>
          </DialogHeader>
          {editLog && (
            <WasteLogForm
              propertyId={propertyId}
              initialData={editLog}
              onSuccess={() => {
                setEditLog(null)
                onRefresh()
              }}
              onCancel={() => setEditLog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteLog} onOpenChange={(o) => !o && setDeleteLog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the waste log for{' '}
              {deleteLog && formatDate(deleteLog.logDate)}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="default" size="default" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
