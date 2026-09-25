'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { taskAge } from '@/lib/tasks/dates'
import { canEditTask, canTransferTask, canDecideTask } from '@/lib/tasks/policy'
import type { TaskRow } from '@/lib/tasks/queries'
import {
  type Options,
  inputStyle,
  taskFetch,
  jsonRequest,
  statusLabel,
} from './workspace-types'
type Activity = {
  events: {
    id: string
    actor_name: string
    kind: string
    created_at: string
    before_value: Record<string, unknown> | null
    after_value: Record<string, unknown> | null
  }[]
  comments: {
    id: string
    body: string
    actor_name: string
    created_at: string
  }[]
  files: { id: string; name: string; size: number }[]
}
const time = (value: string) =>
  new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })
export function TaskDetailPanel({
  id,
  options,
  onClose,
  onChange,
}: {
  id: string | null
  options: Options
  onClose: () => void
  onChange: () => void
}) {
  const [task, setTask] = useState<TaskRow | null>(null),
    [activity, setActivity] = useState<Activity | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('details'),
    [historyPage, setHistoryPage] = useState(1)
  const load = useCallback(async () => {
    if (!id) return
    const [t, h] = await Promise.all([
      taskFetch<TaskRow>('/api/tasks/' + id),
      taskFetch<Activity>(`/api/tasks/${id}/history?page=${historyPage}`),
    ])
    setTask(t)
    setActivity(h)
  }, [id, historyPage])
  useEffect(() => {
    let active = true
    if (!id) return
    setTask(null)
    setError('')
    Promise.all([
      taskFetch<TaskRow>('/api/tasks/' + id),
      taskFetch<Activity>(`/api/tasks/${id}/history?page=${historyPage}`),
    ])
      .then(([t, h]) => {
        if (active) {
          setTask(t)
          setActivity(h)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [id, historyPage])
  const scope = task
    ? {
        orgId: task.org_id,
        propertyId: task.property_id,
        committeeId: task.committee_id,
        assigneeIds: task.assignee_ids,
      }
    : null
  const editable = !!scope && canEditTask(options.actor, scope),
    transfer = !!scope && canTransferTask(options.actor, scope),
    decide = !!scope && canDecideTask(options.actor, scope)
  async function action(command: unknown) {
    if (!id || !task) return
    setBusy(true)
    setError('')
    try {
      await taskFetch(
        `/api/tasks/${id}/actions`,
        jsonRequest({ version: task.version, command }),
      )
      await load()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open={!!id}
      onOpenChange={(v) => {
        if (!v) {
          setTab('details')
          setHistoryPage(1)
          onClose()
        }
      }}
    >
      <SheetContent className="!w-full overflow-y-auto p-0 sm:!max-w-2xl">
        <SheetHeader className="border-b p-6 pr-12">
          <SheetTitle>{task?.title ?? 'Task details'}</SheetTitle>
          <SheetDescription>
            {task
              ? `${task.property_name ?? 'No property'} · ${task.committee_name}`
              : 'Loading task…'}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-6">
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
            >
              {error}
              <button
                className="ml-3 underline"
                onClick={() => load().catch((e) => setError(e.message))}
              >
                Refresh task
              </button>
            </div>
          )}
          {task && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-muted px-2 py-1">
                  {statusLabel(task.status)}
                </span>
                <span
                  className={`rounded px-2 py-1 ${task.approval === 'pending' || task.approval === 'rejected' ? 'bg-amber-100 text-amber-900' : 'bg-muted'}`}
                >
                  {statusLabel(task.approval)}
                </span>
                <span className="text-muted-foreground">
                  {taskAge(task.created_at, task.completed_at)} days · Raised{' '}
                  {time(task.created_at)}
                </span>
              </div>
              {['pending', 'rejected'].includes(task.approval) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {task.approval === 'pending'
                    ? 'Work is paused until a member of the owning committee approves.'
                    : 'This request was rejected. Operations or an admin can request another review.'}
                </div>
              )}
              <nav className="flex border-b" aria-label="Task detail sections">
                {['details', 'discussion', 'history'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`border-b-2 px-4 py-2 text-sm capitalize ${tab === t ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              {tab === 'details' && (
                <div className="space-y-5">
                  <form
                    key={task.version}
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const f = new FormData(e.currentTarget)
                      action({
                        type: 'edit',
                        patch: {
                          title: f.get('title'),
                          description: f.get('description') || null,
                          propertyId: f.get('propertyId') || null,
                          projectId: f.get('projectId') || null,
                          priority: f.get('priority'),
                          dueDate: f.get('dueDate') || null,
                          assigneeIds: f.getAll('assigneeIds'),
                        },
                      })
                    }}
                  >
                    <fieldset
                      disabled={!editable || busy}
                      className="space-y-4"
                    >
                      <label className="block space-y-1 text-sm">
                        Task
                        <input
                          name="title"
                          defaultValue={task.title}
                          required
                          maxLength={1000}
                          className={inputStyle}
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        Description
                        <textarea
                          name="description"
                          defaultValue={task.description ?? ''}
                          rows={4}
                          className={inputStyle + ' !h-auto py-2'}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {(
                          [
                            [
                              'propertyId',
                              'Property',
                              options.properties,
                              task.property_id,
                            ],
                            [
                              'projectId',
                              'Project',
                              options.projects,
                              task.project_id,
                            ],
                          ] as const
                        ).map(([name, label, items, value]) => (
                          <label className="space-y-1 text-sm" key={name}>
                            {label}
                            <select
                              name={name}
                              defaultValue={value ?? ''}
                              className={inputStyle}
                            >
                              <option value="">None</option>
                              {items.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                        <label className="space-y-1 text-sm">
                          Priority
                          <select
                            name="priority"
                            defaultValue={task.priority}
                            className={inputStyle}
                          >
                            {['high', 'medium', 'low'].map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          Deadline
                          <input
                            type="date"
                            name="dueDate"
                            defaultValue={task.due_date ?? ''}
                            className={inputStyle}
                          />
                        </label>
                      </div>
                      <fieldset className="rounded border p-3">
                        <legend className="px-1 text-sm">Responsibility</legend>
                        <div className="grid max-h-40 grid-cols-2 gap-2 overflow-auto">
                          {options.users.map((u) => (
                            <label
                              key={u.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <input
                                name="assigneeIds"
                                type="checkbox"
                                value={u.id}
                                defaultChecked={task.assignee_ids.includes(
                                  u.id,
                                )}
                              />
                              {u.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {editable && (
                        <Button type="submit" disabled={busy}>
                          Save changes
                        </Button>
                      )}
                    </fieldset>
                  </form>
                  {editable && task.status !== 'done' && (
                    <section className="space-y-2 border-t pt-4">
                      <h3 className="text-sm font-medium">Update progress</h3>
                      <div className="flex flex-wrap gap-2">
                        {['todo', 'in_progress', 'stuck', 'done'].map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant={
                              task.status === s ? 'secondary' : 'outline'
                            }
                            disabled={
                              busy ||
                              task.status === s ||
                              (['in_progress', 'done'].includes(s) &&
                                ['pending', 'rejected'].includes(task.approval))
                            }
                            onClick={() =>
                              action({ type: 'progress', status: s })
                            }
                          >
                            {statusLabel(s)}
                          </Button>
                        ))}
                      </div>
                    </section>
                  )}
                  {decide && task.approval === 'pending' && (
                    <form
                      className="space-y-3 rounded-lg border p-4"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const f = new FormData(e.currentTarget)
                        const submitter = (e.nativeEvent as SubmitEvent)
                          .submitter as HTMLButtonElement
                        action({
                          type: 'decide',
                          cycle: task.approval_cycle,
                          decision: submitter.value,
                          note: f.get('note'),
                        })
                      }}
                    >
                      <h3 className="font-medium">Committee decision</h3>
                      <textarea
                        name="note"
                        aria-label="Decision note"
                        placeholder="Record the reason for your decision"
                        className={inputStyle + ' !h-20 py-2'}
                        maxLength={4000}
                      />
                      <div className="flex gap-2">
                        <Button value="approved" disabled={busy}>
                          Approve
                        </Button>
                        <Button
                          value="rejected"
                          variant="outline"
                          disabled={busy}
                        >
                          Reject
                        </Button>
                      </div>
                    </form>
                  )}
                  {transfer && task.status !== 'done' && (
                    <form
                      className="space-y-3 rounded-lg border p-4"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const f = new FormData(e.currentTarget)
                        const choice = String(f.get('committee'))
                        action(
                          choice === 'review'
                            ? {
                                type:
                                  task.approval === 'rejected'
                                    ? 'resubmit'
                                    : 'require_approval',
                                reason: f.get('reason'),
                              }
                            : {
                                type: 'transfer',
                                committeeId: choice,
                                reason: f.get('reason'),
                              },
                        )
                      }}
                    >
                      <h3 className="font-medium">Committee ownership</h3>
                      <select
                        name="committee"
                        aria-label="Receiving committee"
                        className={inputStyle}
                      >
                        <option value="review">
                          {task.approval === 'rejected'
                            ? 'Request a new review'
                            : 'Require approval from current committee'}
                        </option>
                        {options.committees
                          .filter((c) => c.id !== task.committee_id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              Transfer to {c.name}
                            </option>
                          ))}
                      </select>
                      <textarea
                        name="reason"
                        required
                        placeholder="Why is this review or transfer needed?"
                        aria-label="Transfer reason"
                        className={inputStyle + ' !h-20 py-2'}
                      />
                      <p className="text-xs text-muted-foreground">
                        Transferring ownership pauses work and requests a fresh
                        approval.
                      </p>
                      <Button variant="outline" disabled={busy}>
                        Send for review
                      </Button>
                    </form>
                  )}
                  {editable && task.status === 'done' && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        action({
                          type: 'reopen',
                          reason: new FormData(e.currentTarget).get('reason'),
                        })
                      }}
                    >
                      <input
                        name="reason"
                        aria-label="Reason for reopening"
                        required
                        placeholder="Reason for reopening"
                        className={inputStyle}
                      />
                      <Button disabled={busy}>Reopen</Button>
                    </form>
                  )}
                </div>
              )}
              {tab === 'discussion' && (
                <div className="space-y-5">
                  {editable && (
                    <form
                      className="space-y-2"
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const form = e.currentTarget
                        setBusy(true)
                        try {
                          await taskFetch(
                            `/api/tasks/${id}/comments`,
                            jsonRequest({
                              body: new FormData(form).get('body'),
                            }),
                          )
                          form.reset()
                          await load()
                        } catch (e) {
                          setError((e as Error).message)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      <textarea
                        name="body"
                        required
                        maxLength={10000}
                        aria-label="New comment"
                        placeholder="Add an update, question or reason for delay…"
                        className={inputStyle + ' !h-24 py-2'}
                      />
                      <Button disabled={busy}>Add comment</Button>
                    </form>
                  )}
                  {activity?.comments.map((c) => (
                    <article key={c.id} className="border-b pb-4">
                      <p className="text-xs text-muted-foreground">
                        {c.actor_name} · {time(c.created_at)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {c.body}
                      </p>
                    </article>
                  ))}
                  <section className="space-y-3">
                    <h3 className="font-medium">Supporting files</h3>
                    {editable && (
                      <label className="block rounded border border-dashed p-4 text-sm">
                        Add photos or documents
                        <span className="mb-2 block text-xs text-muted-foreground">
                          JPEG, PNG, WebP, PDF, DOCX or XLSX · Up to 10 MB each
                        </span>
                        <input
                          type="file"
                          disabled={busy}
                          accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setBusy(true)
                            setError('')
                            try {
                              const f = new FormData()
                              f.set('file', file)
                              await taskFetch(`/api/tasks/${id}/attachments`, {
                                method: 'POST',
                                body: f,
                              })
                              await load()
                              onChange()
                            } catch (e) {
                              setError((e as Error).message)
                            } finally {
                              setBusy(false)
                              e.target.value = ''
                            }
                          }}
                        />
                      </label>
                    )}
                    {activity?.files.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <a
                          href={`/api/tasks/${id}/attachments/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate underline"
                        >
                          {f.name}
                        </a>
                        {editable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true)
                              try {
                                await taskFetch(
                                  `/api/tasks/${id}/attachments/${f.id}`,
                                  { method: 'DELETE' },
                                )
                                await load()
                                onChange()
                              } catch (e) {
                                setError((e as Error).message)
                              } finally {
                                setBusy(false)
                              }
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </section>
                </div>
              )}
              {tab === 'history' && (
                <div className="space-y-4">
                  {activity?.events.map((event) => (
                    <article key={event.id} className="border-l-2 pl-4">
                      <p className="text-sm font-medium">
                        {event.kind.replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.actor_name} · {time(event.created_at)} (Sri
                        Lanka)
                      </p>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          View recorded changes
                        </summary>
                        <div className="mt-2 space-y-1 overflow-auto rounded bg-muted p-3">
                          {Object.keys(
                            event.after_value ?? event.before_value ?? {},
                          )
                            .filter(
                              (k) =>
                                JSON.stringify(event.before_value?.[k]) !==
                                JSON.stringify(event.after_value?.[k]),
                            )
                            .map((k) => (
                              <p key={k}>
                                <strong>{k.replaceAll('_', ' ')}:</strong>{' '}
                                {event.before_value && (
                                  <span>
                                    {JSON.stringify(event.before_value[k])}{' '}
                                    →{' '}
                                  </span>
                                )}
                                {JSON.stringify(event.after_value?.[k] ?? null)}
                              </p>
                            ))}
                        </div>
                      </details>
                    </article>
                  ))}
                </div>
              )}
              {tab !== 'details' && (
                <div className="flex justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage((p) => p - 1)}
                  >
                    Newer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      (tab === 'history'
                        ? activity?.events.length
                        : activity?.comments.length) !== 30
                    }
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    Older
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
