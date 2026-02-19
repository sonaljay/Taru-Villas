'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Plus, Trash2, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'

import type { SopAssignmentWithDetails } from '@/lib/db/queries/sops'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertyOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  fullName: string
}

interface SopAssignmentsProps {
  templateId: string
  assignments: SopAssignmentWithDetails[]
  properties: PropertyOption[]
  users: UserOption[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SopAssignments({
  templateId,
  assignments: initialAssignments,
  properties,
  users,
}: SopAssignmentsProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [userId, setUserId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [frequency, setFrequency] = useState<string>('daily')
  const [deadlineTime, setDeadlineTime] = useState('09:00')
  const [deadlineDay, setDeadlineDay] = useState<string>('')

  const resetForm = () => {
    setUserId('')
    setPropertyId('')
    setFrequency('daily')
    setDeadlineTime('09:00')
    setDeadlineDay('')
  }

  const handleCreate = async () => {
    if (!userId || !propertyId) return
    setSaving(true)
    try {
      const res = await fetch('/api/sops/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          userId,
          propertyId,
          frequency,
          deadlineTime,
          deadlineDay:
            frequency === 'daily'
              ? null
              : deadlineDay
                ? parseInt(deadlineDay)
                : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create')
      }
      setDialogOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create assignment')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this assignment?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/sops/assignments/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch {
      alert('Failed to delete assignment')
    } finally {
      setDeleting(null)
    }
  }

  const frequencyLabel = (freq: string) => {
    switch (freq) {
      case 'daily':
        return 'Daily'
      case 'weekly':
        return 'Weekly'
      case 'monthly':
        return 'Monthly'
      default:
        return freq
    }
  }

  const dayLabel = (freq: string, day: number | null) => {
    if (freq === 'daily' || day === null) return '-'
    if (freq === 'weekly') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      return days[day] ?? day
    }
    return `Day ${day}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Assignments</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="size-4" />
              Add Assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deadline Time</Label>
                <Input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                />
              </div>

              {frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select value={deadlineDay} onValueChange={setDeadlineDay}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select day..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Monday</SelectItem>
                      <SelectItem value="1">Tuesday</SelectItem>
                      <SelectItem value="2">Wednesday</SelectItem>
                      <SelectItem value="3">Thursday</SelectItem>
                      <SelectItem value="4">Friday</SelectItem>
                      <SelectItem value="5">Saturday</SelectItem>
                      <SelectItem value="6">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={deadlineDay}
                    onChange={(e) => setDeadlineDay(e.target.value)}
                    placeholder="1-28"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving || !userId || !propertyId}
              >
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {initialAssignments.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No assignments yet. Add one to assign this SOP to a user at a property.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialAssignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.user.fullName}
                  </TableCell>
                  <TableCell>{a.property.name}</TableCell>
                  <TableCell>{frequencyLabel(a.frequency)}</TableCell>
                  <TableCell className="tabular-nums">
                    {a.deadlineTime}
                  </TableCell>
                  <TableCell>
                    {dayLabel(a.frequency, a.deadlineDay)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={a.isActive ? 'default' : 'secondary'}
                    >
                      {a.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(a.id)}
                      disabled={deleting === a.id}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
