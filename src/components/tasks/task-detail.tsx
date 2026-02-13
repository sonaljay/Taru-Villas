'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowLeft,
  RotateCcw,
  User,
  Building2,
  Calendar,
  FileText,
  AlertTriangle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskDetailData {
  id: string
  title: string
  description: string | null
  status: string
  isRepeatIssue: boolean
  propertyName: string
  questionText: string
  assigneeName: string | null
  closerName: string | null
  closingNotes: string | null
  submissionSlug: string | null
  submissionId: string
  responseScore: number
  createdAt: Date | string
  closedAt: Date | string | null
}

interface TaskDetailProps {
  task: TaskDetailData
  backHref?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'open':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
          Open
        </Badge>
      )
    case 'investigating':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
          Investigating
        </Badge>
      )
    case 'closed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
          Closed
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score <= 3
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      : score <= 6
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'

  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-bold ${color}`}>
      {score}/10
    </span>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskDetail({ task, backHref = '/tasks' }: TaskDetailProps) {
  const router = useRouter()
  const [isUpdating, setIsUpdating] = useState(false)
  const [closingNotes, setClosingNotes] = useState('')
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  async function handleStatusUpdate(newStatus: 'investigating' | 'closed') {
    if (newStatus === 'closed' && (!closingNotes || closingNotes.trim().length === 0)) {
      toast.error('Please provide closing notes')
      return
    }

    setIsUpdating(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === 'closed' && { closingNotes }),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update task')
      }

      toast.success(
        newStatus === 'investigating'
          ? 'Task marked as investigating'
          : 'Task closed'
      )
      setShowCloseDialog(false)
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update task'
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const canInvestigate = task.status === 'open'
  const canClose = task.status === 'open' || task.status === 'investigating'

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="size-4" />
          Back to Tasks
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={task.status} />
            {task.isRepeatIssue && (
              <Badge variant="destructive" className="gap-1">
                <RotateCcw className="size-3" />
                Repeat Issue
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Issue description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                Issue Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">
                {task.description || 'No description provided.'}
              </p>
            </CardContent>
          </Card>

          {/* Question context */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Survey Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{task.questionText}</p>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Score:</span>
                <ScoreBadge score={task.responseScore} />
              </div>
            </CardContent>
          </Card>

          {/* Closing notes (if closed) */}
          {task.status === 'closed' && task.closingNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Closing Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm leading-relaxed">{task.closingNotes}</p>
                {task.closerName && (
                  <p className="text-xs text-muted-foreground">
                    Closed by {task.closerName}
                    {task.closedAt &&
                      ` on ${format(new Date(task.closedAt), 'MMM d, yyyy')}`}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Status actions */}
          {canClose && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Update Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {canInvestigate && (
                    <Button
                      variant="outline"
                      onClick={() => handleStatusUpdate('investigating')}
                      disabled={isUpdating}
                    >
                      Mark as Investigating
                    </Button>
                  )}

                  <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                    <AlertDialogTrigger asChild>
                      <Button disabled={isUpdating}>
                        Close Task
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Close Task</AlertDialogTitle>
                        <AlertDialogDescription>
                          Please provide closing notes explaining how this issue was resolved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Textarea
                        placeholder="Describe the resolution..."
                        rows={4}
                        value={closingNotes}
                        onChange={(e) => setClosingNotes(e.target.value)}
                        className="mt-2"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleStatusUpdate('closed')}
                          disabled={isUpdating || !closingNotes.trim()}
                        >
                          {isUpdating ? 'Closing...' : 'Close Task'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="size-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Property</div>
                  <div className="text-sm font-medium">{task.propertyName}</div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <User className="size-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Assigned To</div>
                  <div className="text-sm font-medium">
                    {task.assigneeName ?? 'Unassigned'}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="text-sm font-medium">
                    {format(new Date(task.createdAt), 'MMM d, yyyy')}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <FileText className="size-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Submission</div>
                  {task.submissionSlug ? (
                    <Link
                      href={`/surveys/${task.submissionId}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View Survey
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
