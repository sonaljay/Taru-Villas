'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryState } from 'nuqs'
import { FolderOpen, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ProjectCard } from './project-card'
import { ProjectFormDialog } from './project-form-dialog'
import { TasksAreaTabs } from './tasks-area-tabs'
import type { ProjectWithCounts } from '@/lib/db/queries/projects'

interface ProjectsLandingClientProps {
  projects: ProjectWithCounts[]
  isAdmin: boolean
}

export function ProjectsLandingClient({
  projects,
  isAdmin,
}: ProjectsLandingClientProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [archived, setArchived] = useQueryState('archived', { shallow: false })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Organise work into projects.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          New Project
        </Button>
      </div>

      {/* Tabs + Archived toggle */}
      <div className="flex items-center justify-between gap-4">
        <TasksAreaTabs isAdmin={isAdmin} />
        <Button
          variant={archived === '1' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setArchived(archived === '1' ? null : '1')}
        >
          {archived === '1' ? 'Hide Archived' : 'Show Archived'}
        </Button>
      </div>

      {/* Grid or empty state */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-1 text-lg font-medium">No projects yet — create one</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Projects help you organise tasks around goals.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            New Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => router.push('/tasks/' + p.id)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={null}
        onSaved={() => {}}
      />
    </div>
  )
}
