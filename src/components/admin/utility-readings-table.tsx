'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Label } from '@/components/ui/label'

interface DailyRow {
  date: string
  readingValue: number | null
  day: number | null
  peak: number | null
  offPeak: number | null
  total: number | null
  pending: boolean
  guestCount: number | null
  staffCount: number | null
  target: number | null
  achieved: boolean | null
}

interface ReadingEntry {
  id: string
  readingDate: string
  readingValue: string
  note: string | null
  recorderName: string | null
}

interface ReadingsTableProps {
  readings: ReadingEntry[]
  dailyRows: DailyRow[]
  utilityType: 'water' | 'electricity'
  onRefresh: () => void
}

export function UtilityReadingsTable({ readings, dailyRows, utilityType, onRefresh }: ReadingsTableProps) {
  const [deleteReading, setDeleteReading] = useState<ReadingEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editReading, setEditReading] = useState<ReadingEntry | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const idByDate = new Map(readings.map((r) => [r.readingDate, r]))
  const displayRows = [...dailyRows].reverse() // newest first

  async function handleDelete() {
    if (!deleteReading) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/utilities/readings/${deleteReading.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Reading deleted')
      setDeleteReading(null)
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editReading) return
    setIsEditing(true)
    try {
      const res = await fetch(`/api/utilities/readings/${editReading.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingValue: parseFloat(editValue) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update')
      }
      toast.success('Reading updated')
      setEditReading(null)
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update')
    } finally {
      setIsEditing(false)
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Readings</CardTitle>
        </CardHeader>
        <CardContent>
          {displayRows.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Meter</TableHead>
                    {utilityType === 'electricity' ? (
                      <>
                        <TableHead className="text-right">Day</TableHead>
                        <TableHead className="text-right">Peak</TableHead>
                        <TableHead className="text-right">Off-Peak</TableHead>
                      </>
                    ) : null}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-center">KPI</TableHead>
                    <TableHead className="text-right">Guests</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((row) => {
                    const reading = idByDate.get(row.date)
                    const num = (v: number | null) => (v !== null ? v.toFixed(1) : '—')
                    return (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium">{formatDate(row.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.readingValue !== null ? row.readingValue.toLocaleString() : '—'}
                        </TableCell>
                        {utilityType === 'electricity' ? (
                          <>
                            <TableCell className="text-right tabular-nums">{num(row.day)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(row.peak)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(row.offPeak)}</TableCell>
                          </>
                        ) : null}
                        <TableCell className="text-right tabular-nums">
                          {row.pending ? (
                            <span className="text-muted-foreground">pending</span>
                          ) : (
                            num(row.total)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {num(row.target)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.achieved === null ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : row.achieved ? (
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Met
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Over
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.guestCount ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.staffCount ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost" size="icon" className="size-8"
                              disabled={!reading}
                              onClick={() => {
                                if (!reading) return
                                setEditReading(reading)
                                setEditValue(reading.readingValue)
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="size-8"
                              disabled={!reading}
                              onClick={() => reading && setDeleteReading(reading)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No readings recorded for this month.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editReading} onOpenChange={(open) => !open && setEditReading(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Reading — {editReading && formatDate(editReading.readingDate)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-value">Meter Reading</Label>
              <Input
                id="edit-value"
                type="number"
                step="0.01"
                min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditReading(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isEditing}>
                {isEditing ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReading} onOpenChange={(o) => !o && setDeleteReading(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reading?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the meter reading for{' '}
              {deleteReading && formatDate(deleteReading.readingDate)}.
              This action cannot be undone.
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
