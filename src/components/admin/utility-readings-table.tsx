'use client'

import { DiscardButton } from '@/components/ui/discard-button'

import { useNativeFormGuard } from '@/hooks/use-native-form-guard'

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
  penalty: 'missed' | 'edited' | 'normal'
}

interface ReadingEntry {
  id: string
  readingDate: string
  readingValue: string | null
  note: string | null
  recorderName: string | null
}

interface ReadingsTableProps {
  readings: ReadingEntry[]
  dailyRows: DailyRow[]
  utilityType: 'water' | 'electricity'
  isAdmin: boolean
  onRefresh: () => void
}

function ReadingKpi({ row }: { row: DailyRow }) {
  if (row.penalty === 'missed') return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Missed</span>
  if (row.achieved === null) return <span className="text-muted-foreground">—</span>
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${row.achieved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{row.achieved ? 'Met' : 'Over'}</span>
}

export function UtilityReadingsTable({ readings, dailyRows, utilityType, isAdmin, onRefresh }: ReadingsTableProps) {
  const { formProps, markSaved } = useNativeFormGuard()

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
      markSaved()
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
            <>
            <div className="grid gap-3 lg:grid-cols-2 xl:hidden" aria-label="Daily readings">
              {displayRows.map(row => {
                const reading = idByDate.get(row.date)
                const num = (value: number | null) => value === null ? '—' : value.toFixed(1)
                return <article key={row.date} className="min-w-0 rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{formatDate(row.date)}{isAdmin && row.penalty === 'edited' && <span className="ml-2 text-sm font-normal text-amber-700 dark:text-amber-400">Late edit</span>}</h3>
                    {isAdmin && <ReadingKpi row={row} />}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-muted-foreground">Meter reading</dt><dd className="mt-1 break-words font-medium tabular-nums">{row.readingValue?.toLocaleString() ?? '—'}</dd></div>
                    <div><dt className="text-muted-foreground">Consumption</dt><dd className="mt-1 font-medium tabular-nums">{row.pending ? 'Pending' : num(row.total)}</dd></div>
                    {utilityType === 'electricity' && <><div><dt className="text-muted-foreground">Day</dt><dd className="mt-1 tabular-nums">{num(row.day)}</dd></div><div><dt className="text-muted-foreground">Peak</dt><dd className="mt-1 tabular-nums">{num(row.peak)}</dd></div><div><dt className="text-muted-foreground">Off-peak</dt><dd className="mt-1 tabular-nums">{num(row.offPeak)}</dd></div></>}
                    {isAdmin && <div><dt className="text-muted-foreground">Target</dt><dd className="mt-1 tabular-nums">{num(row.target)}</dd></div>}
                    <div><dt className="text-muted-foreground">Guests</dt><dd className="mt-1 tabular-nums">{row.guestCount ?? '—'}</dd></div><div><dt className="text-muted-foreground">Staff</dt><dd className="mt-1 tabular-nums">{row.staffCount ?? '—'}</dd></div>
                  </dl>
                  {reading && <div className="mt-4 flex flex-wrap gap-2 border-t pt-3"><Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditReading(reading); setEditValue(reading.readingValue ?? '') }}><Pencil className="size-4" />Edit reading</Button><Button variant="ghost" size="sm" className="flex-1" onClick={() => setDeleteReading(reading)}><Trash2 className="size-4" />Delete</Button></div>}
                </article>
              })}
            </div>
            <div className="hidden rounded-md border xl:block">
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
                    {isAdmin && <TableHead className="text-right">Target</TableHead>}
                    {isAdmin && <TableHead className="text-center">KPI</TableHead>}
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
                        <TableCell className="font-medium">
                          <span>{formatDate(row.date)}</span>
                          {isAdmin && row.penalty === 'edited' && (
                            <span className="ml-1.5 text-xs text-amber-600 font-normal">(late edit)</span>
                          )}
                        </TableCell>
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
                        {isAdmin && (
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {num(row.target)}
                          </TableCell>
                        )}
                        {isAdmin && (
                          <TableCell className="text-center">
                            <ReadingKpi row={row} />
                          </TableCell>
                        )}
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
                              aria-label={`Edit reading for ${formatDate(row.date)}`}
                              disabled={!reading}
                              onClick={() => {
                                if (!reading) return
                                setEditReading(reading)
                                setEditValue(reading.readingValue ?? '')
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="size-8"
                              aria-label={`Delete reading for ${formatDate(row.date)}`}
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
            </>
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
          <form {...formProps} onSubmit={handleEdit} className="space-y-4">
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
              <DiscardButton type="button" variant="outline" onClick={() => setEditReading(null)}>
                Cancel
              </DiscardButton>
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
