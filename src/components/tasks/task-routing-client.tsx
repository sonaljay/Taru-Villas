'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  type Options,
  inputStyle,
  taskFetch,
  jsonRequest,
  statusLabel,
} from './workspace-types'
type RouteTask = {
  id: string
  title: string
  version: number
  committee_id: string
  committee_name: string
  property_name: string | null
  approval: string
}
export function TaskRoutingClient({ options }: { options: Options }) {
  const [items, setItems] = useState<RouteTask[]>([]),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<RouteTask | null>(null),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    const timer = setTimeout(
      () =>
        taskFetch<RouteTask[]>(
          '/api/tasks/routing?search=' + encodeURIComponent(search),
          { signal: c.signal },
        )
          .then(setItems)
          .catch((e) => {
            if (e.name !== 'AbortError') setError(e.message)
          }),
      200,
    )
    return () => {
      clearTimeout(timer)
      c.abort()
    }
  }, [search, tick])
  return (
    <div className="space-y-5">
      <Link
        href="/tasks"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Task Manager
      </Link>
      <h1 className="text-2xl font-semibold">Route tasks</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Operations can transfer ownership across committees. This view shows the
        information needed to route tasks; full details follow normal task
        visibility.
      </p>
      <input
        className={inputStyle}
        aria-label="Find a task to route"
        placeholder="Search open tasks…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {selected && (
        <form
          key={selected.id}
          className="space-y-3 rounded-lg border p-5"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            const f = new FormData(e.currentTarget),
              committee = String(f.get('committee'))
            try {
              await taskFetch(
                `/api/tasks/${selected.id}/actions`,
                jsonRequest({
                  version: selected.version,
                  command:
                    committee === 'review'
                      ? {
                          type:
                            selected.approval === 'rejected'
                              ? 'resubmit'
                              : 'require_approval',
                          reason: f.get('reason'),
                        }
                      : {
                          type: 'transfer',
                          committeeId: committee,
                          reason: f.get('reason'),
                        },
                }),
              )
              setSelected(null)
              setTick((t) => t + 1)
            } catch (e) {
              setError((e as Error).message)
              setTick((t) => t + 1)
            } finally {
              setBusy(false)
            }
          }}
        >
          <h2 className="font-medium">{selected.title}</h2>
          <select
            name="committee"
            aria-label="Receiving committee"
            className={inputStyle}
          >
            <option value="review">
              Request approval from {selected.committee_name}
            </option>
            {options.committees
              .filter((c) => c.id !== selected.committee_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  Transfer to {c.name}
                </option>
              ))}
          </select>
          <textarea
            name="reason"
            aria-label="Reason for transfer"
            required
            placeholder="Reason for review or transfer"
            className={inputStyle + ' !h-20 py-2'}
          />
          <div className="flex gap-2">
            <Button disabled={busy}>Send for approval</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="divide-y rounded-lg border">
        {items.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div>
              <p className="font-medium">{t.title}</p>
              <p className="text-sm text-muted-foreground">
                {t.property_name ?? 'No property'} · {t.committee_name} ·{' '}
                {statusLabel(t.approval)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelected(t)}>
              Route
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Showing up to 100 open tasks. Search to narrow the list.
      </p>
    </div>
  )
}
