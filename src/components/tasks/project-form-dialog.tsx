'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'

import type { Project } from '@/lib/db/schema'
import { PROJECT_COLORS } from './project-card'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  project?: Project | null
  onSaved: () => void
}

type FormValues = {
  name: string
  description: string
  status: 'active' | 'archived'
  targetDate: string // '' maps to null on submit
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: ProjectFormDialogProps) {
  const router = useRouter()

  const [isPending, setIsPending] = useState(false)
  const [color, setColor] = useState<string>(project?.color ?? PROJECT_COLORS[0])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      status: 'active',
      targetDate: '',
    },
  })

  // Prefill / clear when dialog opens or target project changes
  useEffect(() => {
    reset({
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'active',
      targetDate: project?.targetDate ?? '',
    })
    setColor(project?.color ?? PROJECT_COLORS[0])
  }, [open, project?.id, reset])

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------

  async function onSubmit(values: FormValues) {
    setIsPending(true)
    try {
      const body = {
        name: values.name,
        description: values.description || null,
        color,
        status: values.status,
        targetDate: values.targetDate || null,
      }

      const url = project ? `/api/projects/${project.id}` : '/api/projects'
      const method = project ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Failed to save project')
      }

      toast.success(project ? 'Project updated' : 'Project created')
      onSaved()
      router.refresh()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsPending(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Create Project'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="project-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder="Project name"
              {...register('name', { required: 'Name is required' })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              placeholder="Optional description"
              rows={3}
              {...register('description')}
            />
          </div>

          {/* Color swatches */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className="h-7 w-7 rounded-full transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.25)' : 'scale(1)',
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: color === c ? '2px' : '0',
                  }}
                  aria-pressed={color === c}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Status + Target Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-target-date">Target Date</Label>
              <Input
                id="project-target-date"
                type="date"
                {...register('targetDate')}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? project
                  ? 'Saving…'
                  : 'Creating…'
                : project
                  ? 'Save Changes'
                  : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
