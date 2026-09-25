'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { taskFetch } from '@/components/tasks/workspace-types'
type Notice = {
  id: string
  title: string
  body: string | null
  link_url: string | null
  read_at: string | null
  created_at: string
}
export function NotificationInbox() {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<{ items: Notice[]; unread: number }>({
      items: [],
      unread: 0,
    }),
    [error, setError] = useState(''),
    [page, setPage] = useState(1)
  useEffect(() => {
    let active = true
    const load = () =>
      taskFetch<typeof data>(`/api/notifications?page=${page}`)
        .then((v) => {
          if (active) {
            setData(v)
            setError('')
          }
        })
        .catch(() => {
          if (active) setError('Notifications are unavailable.')
        })
    load()
    const timer = setInterval(load, 60000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [open, page])
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications, ${data.unread} unread`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell className="size-4" />
        {data.unread > 0 && (
          <span className="absolute right-0 top-0 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {data.unread}
          </span>
        )}
      </Button>
      {open && (
        <section
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 max-h-[70dvh] w-[min(24rem,90vw)] overflow-auto rounded-lg border bg-background p-4 shadow-lg"
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Notifications</h2>
            <button
              className="text-xs underline"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </header>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          {!data.items.length && !error && (
            <p className="text-sm text-muted-foreground">
              You’re all caught up.
            </p>
          )}
          {data.items.map((n) => (
            <article key={n.id} className="border-b py-3">
              <Link
                href={
                  n.link_url?.startsWith('/') && !n.link_url.startsWith('//')
                    ? n.link_url
                    : '/tasks'
                }
                className={`block text-sm ${n.read_at ? 'text-muted-foreground' : 'font-medium'}`}
                onClick={() => {
                  taskFetch('/api/notifications/' + n.id, {
                    method: 'PATCH',
                  }).catch(() => {})
                  setOpen(false)
                }}
              >
                {n.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString('en-GB', {
                  timeZone: 'Asia/Colombo',
                })}
              </p>
              {!n.read_at && (
                <button
                  className="mt-2 text-xs underline"
                  onClick={async () => {
                    try {
                      await taskFetch('/api/notifications/' + n.id, {
                        method: 'PATCH',
                      })
                      setData((d) => ({
                        ...d,
                        unread: Math.max(0, d.unread - 1),
                        items: d.items.map((x) =>
                          x.id === n.id
                            ? { ...x, read_at: new Date().toISOString() }
                            : x,
                        ),
                      }))
                    } catch {
                      setError('Could not mark this notification as read.')
                    }
                  }}
                >
                  Mark read
                </button>
              )}
            </article>
          ))}
          <footer className="mt-3 flex justify-between">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs disabled:opacity-40"
            >
              Newer
            </button>
            <button
              disabled={data.items.length < 20}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs disabled:opacity-40"
            >
              Older
            </button>
          </footer>
        </section>
      )}
    </div>
  )
}
