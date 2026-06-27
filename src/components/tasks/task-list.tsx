'use client'

import { format } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TaskWithRelations } from '@/lib/db/queries/tasks'
import { StatusBadge, PriorityDot, TeamChips, AssigneeAvatars } from './task-meta'

interface TaskListProps {
  tasks: TaskWithRelations[]
  onEdit: (t: TaskWithRelations) => void
}

export function TaskList({ tasks, onEdit }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">No tasks found.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Teams</TableHead>
            <TableHead>Assignees</TableHead>
            <TableHead>Property</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow
              key={task.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onEdit(task)}
            >
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell>
                <TeamChips teams={task.teams} />
              </TableCell>
              <TableCell>
                <AssigneeAvatars assignees={task.assignees} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {task.propertyName ?? '—'}
              </TableCell>
              <TableCell>
                <PriorityDot priority={task.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={task.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground tabular-nums">
                {task.dueDate ? format(new Date(task.dueDate), 'd MMM yyyy') : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
