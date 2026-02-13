'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Search,
  ListTodo,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string
  title: string
  status: string
  isRepeatIssue: boolean
  propertyId: string
  propertyName: string
  assigneeName: string | null
  raisedByName: string | null
  createdAt: Date | string
}

interface PropertyOption {
  id: string
  name: string
}

interface TasksPageClientProps {
  tasks: TaskRow[]
  properties: PropertyOption[]
  isAdmin?: boolean
  basePath?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'open':
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
          Open
        </Badge>
      )
    case 'investigating':
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          Investigating
        </Badge>
      )
    case 'closed':
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
          Closed
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TasksPageClient({
  tasks,
  properties,
  isAdmin,
  basePath = '/tasks',
}: TasksPageClientProps) {
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [repeatFilter, setRepeatFilter] = useState('all')

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch =
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.propertyName.toLowerCase().includes(search.toLowerCase())

      const matchesProperty =
        propertyFilter === 'all' || t.propertyId === propertyFilter

      const matchesStatus =
        statusFilter === 'all' || t.status === statusFilter

      const matchesRepeat =
        repeatFilter === 'all' ||
        (repeatFilter === 'repeat' && t.isRepeatIssue) ||
        (repeatFilter === 'new' && !t.isRepeatIssue)

      return matchesSearch && matchesProperty && matchesStatus && matchesRepeat
    })
  }, [tasks, search, propertyFilter, statusFilter, repeatFilter])

  const openCount = tasks.filter((t) => t.status === 'open').length
  const investigatingCount = tasks.filter((t) => t.status === 'investigating').length
  const repeatCount = tasks.filter((t) => t.isRepeatIssue).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Track and resolve issues flagged from survey assessments
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">{openCount}</div>
          <div className="text-xs text-muted-foreground">Open</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-amber-600">{investigatingCount}</div>
          <div className="text-xs text-muted-foreground">Investigating</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-1.5">
            <div className="text-2xl font-bold text-orange-600">{repeatCount}</div>
            <RotateCcw className="size-4 text-orange-500" />
          </div>
          <div className="text-xs text-muted-foreground">Repeat Issues</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={repeatFilter} onValueChange={setRepeatFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Issue Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Issues</SelectItem>
            <SelectItem value="repeat">Repeat Only</SelectItem>
            <SelectItem value="new">New Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filteredTasks.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issue Raised By</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead className="text-center">Flags</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <Link
                      href={`${basePath}/${task.id}`}
                      className="font-medium hover:underline line-clamp-2"
                    >
                      {task.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {task.propertyName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={task.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {task.raisedByName ?? (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {task.assigneeName ?? (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {task.isRepeatIssue && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <RotateCcw className="size-3" />
                        Repeat
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {format(new Date(task.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <ListTodo className="size-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">No tasks found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || propertyFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Tasks will appear here when surveys with low scores are submitted.'}
          </p>
        </div>
      )}
    </div>
  )
}
