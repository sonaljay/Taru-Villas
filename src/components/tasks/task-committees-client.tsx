'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TasksAreaTabs } from './tasks-area-tabs'
import {
  type Options,
  type Committee,
  inputStyle,
  taskFetch,
  jsonRequest,
} from './workspace-types'
export function TaskCommitteesClient({ options }: { options: Options }) {
  const router = useRouter(),
    [editing, setEditing] = useState<Committee | null>(null),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [failures, setFailures] = useState<
    { id: string; title: string; channel: string; error: string }[]
  >([])
  useEffect(() => {
    taskFetch<typeof failures>('/api/tasks/delivery-status')
      .then(setFailures)
      .catch(() => {})
  }, [])
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Committees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the people who own and review tasks.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setAdding(true)
            setError('')
          }}
        >
          New committee
        </Button>
      </header>
      <TasksAreaTabs isAdmin />
      {failures.length > 0 && (
        <section className="rounded-lg border border-amber-300 p-4">
          <h2 className="font-medium">Notification delivery needs attention</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Failed deliveries remain recorded. Check sender configuration or
            delivery errors before retrying.
          </p>
          {failures.map((f) => (
            <p key={f.id} className="mt-2 text-sm">
              {f.title} · {f.channel}: {f.error}
            </p>
          ))}
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {options.committees.map((c) => (
          <article key={c.id} className="rounded-lg border p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{c.name}</h2>
              {c.is_operations && (
                <span className="rounded bg-muted px-2 py-1 text-xs">
                  Default owner
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {c.member_ids
                .map(
                  (id) =>
                    options.users.find((u) => u.id === id)?.name ??
                    'Inactive user',
                )
                .join(', ') || 'No members — add members to enable approvals.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setEditing(c)
                setAdding(true)
                setError('')
              }}
            >
              Manage members
            </Button>
          </article>
        ))}
      </div>
      {adding && (
        <form
          key={editing?.id ?? 'new'}
          className="max-w-xl space-y-4 rounded-lg border p-5"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            setBusy(true)
            setError('')
            try {
              await taskFetch(
                '/api/tasks/committees' + (editing ? '/' + editing.id : ''),
                jsonRequest(
                  {
                    name: f.get('name'),
                    memberIds: f.getAll('memberIds'),
                    archived: f.get('archived') === 'on',
                  },
                  editing ? 'PATCH' : 'POST',
                ),
              )
              setAdding(false)
              router.refresh()
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <h2 className="font-semibold">
            {editing ? 'Edit committee' : 'Create committee'}
          </h2>
          <label className="block text-sm">
            Name
            <input
              name="name"
              defaultValue={editing?.name}
              required
              maxLength={150}
              className={inputStyle}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm">Members</legend>
            <div className="grid max-h-64 grid-cols-2 gap-3 overflow-auto">
              {options.users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    name="memberIds"
                    type="checkbox"
                    value={u.id}
                    defaultChecked={editing?.member_ids.includes(u.id)}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </fieldset>
          {editing && !editing.is_operations && (
            <label className="flex gap-2 text-sm">
              <input name="archived" type="checkbox" />
              Archive this committee (no open tasks)
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy}>Save committee</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
