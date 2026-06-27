'use client'

import { format } from 'date-fns'
import type { ProjectWithCounts } from '@/lib/db/queries/projects'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

// ---------------------------------------------------------------------------
// Palette — imported by the form dialog too
// ---------------------------------------------------------------------------

export const PROJECT_COLORS = [
  '#64748b',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectCard({
  project,
  onClick,
}: {
  project: ProjectWithCounts
  onClick: () => void
}) {
  const accent = project.color ?? PROJECT_COLORS[0]
  const pct = project.taskCount
    ? Math.round((project.doneCount / project.taskCount) * 100)
    : 0

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
      className="relative cursor-pointer overflow-hidden transition-opacity hover:opacity-90 gap-0 py-0"
    >
      {/* Color accent strip */}
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: accent }}
      />

      <div className="flex flex-col gap-3 p-5">
        {/* Header: name + archived badge */}
        <CardHeader className="p-0">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{project.name}</CardTitle>
            {project.status === 'archived' && (
              <Badge variant="secondary" className="shrink-0">
                Archived
              </Badge>
            )}
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2 mt-1">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="p-0 flex flex-col gap-3">
          {/* Target date */}
          {project.targetDate && (
            <p className="text-xs text-muted-foreground">
              Target:{' '}
              <span className="font-medium text-foreground">
                {format(new Date(project.targetDate), 'd MMM yyyy')}
              </span>
            </p>
          )}

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, backgroundColor: accent }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {project.doneCount} / {project.taskCount} done
            </p>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}
