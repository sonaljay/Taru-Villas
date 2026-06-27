'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'

import type { TaskWithRelations } from '@/lib/db/queries/tasks'
import {
  STATUSES,
  STATUS_META,
  PRIORITIES,
  PRIORITY_META,
  type TaskStatus,
  type TaskPriority,
} from './task-meta'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: TaskWithRelations | null
  properties: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  users: { id: string; fullName: string }[]
  canDelete?: boolean
  onSaved: () => void
}

type FormValues = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  propertyId: string // '' maps to null on submit
  dueDate: string    // '' maps to null on submit
}

// Sentinel for the Radix Select "no property" option (Radix forbids empty-string values)
const NONE = '_none_'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function multiLabel(count: number, singular: string, plural: string): string {
  if (count === 0) return `No ${plural}`
  if (count === 1) return `1 ${singular}`
  return `${count} ${plural}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  properties,
  teams,
  users,
  canDelete,
  onSaved,
}: TaskFormDialogProps) {
  const router = useRouter()
  const isEditing = !!task

  const [isPending, setIsPending] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      propertyId: '',
      dueDate: '',
    },
  })

  // Prefill / clear when the dialog opens or the target task changes
  useEffect(() => {
    reset({
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'todo',
      priority: task?.priority ?? 'medium',
      propertyId: task?.propertyId ?? '',
      dueDate: task?.dueDate ?? '',
    })
    setAssigneeIds(task?.assignees.map((a) => a.id) ?? [])
    setTeamIds(task?.teams.map((t) => t.id) ?? [])
  }, [open, task?.id, reset])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function onSubmit(values: FormValues) {
    setIsPending(true)
    try {
      const body = {
        title: values.title,
        description: values.description || null,
        status: values.status,
        priority: values.priority,
        propertyId: values.propertyId || null,
        dueDate: values.dueDate || null,
        assigneeIds,
        teamIds,
      }

      const url = isEditing ? `/api/tasks/${task.id}` : '/api/tasks'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Failed to save task')
      }

      toast.success(isEditing ? 'Task updated' : 'Task created')
      onSaved()
      router.refresh()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsPending(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    setIsPending(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })

      if (!res.ok) {
        const errBody: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Failed to delete task')
      }

      toast.success('Task deleted')
      onSaved()
      router.refresh()
      setShowDelete(false)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete task')
    } finally {
      setIsPending(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Task' : 'Create Task'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="Task title"
                {...register('title', { required: 'Title is required' })}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                placeholder="Optional description"
                rows={3}
                {...register('description')}
              />
            </div>

            {/* Status + Priority */}
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
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_META[p].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Property */}
            <div className="space-y-1.5">
              <Label>Property</Label>
              <Controller
                control={control}
                name="propertyId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>General (no property)</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date">Due Date</Label>
              <Input
                id="task-due-date"
                type="date"
                {...register('dueDate')}
              />
            </div>

            {/* Assignees multi-select */}
            <div className="space-y-1.5">
              <Label>Assignees</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                  >
                    {multiLabel(assigneeIds.length, 'person', 'assignees')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  {users.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      No users available
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {users.map((u) => (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={assigneeIds.includes(u.id)}
                            onCheckedChange={() =>
                              setAssigneeIds((ids) => toggleId(ids, u.id))
                            }
                          />
                          {u.fullName}
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Teams multi-select */}
            <div className="space-y-1.5">
              <Label>Teams</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                  >
                    {multiLabel(teamIds.length, 'team', 'teams')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  {teams.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      No teams available
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {teams.map((t) => (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={teamIds.includes(t.id)}
                            onCheckedChange={() =>
                              setTeamIds((ids) => toggleId(ids, t.id))
                            }
                          />
                          {t.name}
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Footer row */}
            <div className="flex items-center gap-2 pt-2">
              {canDelete && isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDelete(true)}
                  disabled={isPending}
                >
                  Delete
                </Button>
              )}
              <div className="flex-1" />
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
                  ? isEditing
                    ? 'Saving…'
                    : 'Creating…'
                  : isEditing
                    ? 'Save Changes'
                    : 'Create Task'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — rendered outside the main Dialog to avoid nesting */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task?.title}&quot;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
