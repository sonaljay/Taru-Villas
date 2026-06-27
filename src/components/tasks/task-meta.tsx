'use client'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar'

export const STATUSES = ['todo', 'in_progress', 'stuck', 'done'] as const
export type TaskStatus = (typeof STATUSES)[number]

export const STATUS_META: Record<TaskStatus, { label: string; badge: string; dot: string }> = {
  todo:        { label: 'To Do',       badge: 'bg-slate-100 text-slate-700',     dot: 'bg-slate-400' },
  in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500' },
  stuck:       { label: 'Stuck',       badge: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  done:        { label: 'Done',        badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof PRIORITIES)[number]
export const PRIORITY_META: Record<TaskPriority, { label: string; dot: string }> = {
  low:    { label: 'Low',    dot: 'bg-slate-400' },
  medium: { label: 'Medium', dot: 'bg-amber-500' },
  high:   { label: 'High',   dot: 'bg-red-500' },
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status]
  return <Badge className={`${m.badge} border-0`}>{m.label}</Badge>
}

export function PriorityDot({ priority }: { priority: TaskPriority }) {
  const m = PRIORITY_META[priority]
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`size-2 rounded-full ${m.dot}`} />{m.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function TeamChips({ teams }: { teams: { id: string; name: string }[] }) {
  if (teams.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {teams.map((t) => (
        <Badge key={t.id} variant="secondary" className="text-xs px-1.5 py-0">
          {t.name}
        </Badge>
      ))}
    </div>
  )
}

export function AssigneeAvatars({ assignees }: { assignees: { id: string; fullName: string }[] }) {
  if (assignees.length === 0) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>
  }
  return (
    <AvatarGroup>
      {assignees.map((a) => (
        <Avatar key={a.id} size="sm">
          <AvatarFallback>{initials(a.fullName)}</AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  )
}
