'use client'

import React from 'react'
import { format } from 'date-fns'
import type { TaskWithRelations } from '@/lib/db/queries/tasks'
import { PriorityDot, TeamChips, AssigneeAvatars } from './task-meta'

interface TaskCardProps {
  task: TaskWithRelations
  draggable?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onClick?: () => void
}

export function TaskCard({ task, draggable, onDragStart, onClick }: TaskCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className="rounded-lg border bg-card p-3 shadow-sm cursor-pointer select-none hover:shadow-md transition-shadow space-y-2"
    >
      <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
      {task.teams.length > 0 && <TeamChips teams={task.teams} />}
      <div className="flex items-center justify-between gap-2">
        <AssigneeAvatars assignees={task.assignees} />
        <PriorityDot priority={task.priority} />
      </div>
      {task.dueDate && (
        <p className="text-xs text-muted-foreground">
          {format(new Date(task.dueDate), 'd MMM')}
        </p>
      )}
    </div>
  )
}
