'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useQueryState, useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import {
  Plus,
  Search,
  SlidersHorizontal,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Users,
  FolderOpen,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type TaskRow } from '@/lib/tasks/queries'
import { taskAge, reminderKind } from '@/lib/tasks/dates'
import { TaskDetailPanel } from './task-detail-panel'
import { TaskCreateDialog } from './task-create-dialog'
import {
  taskFetch,
  statusLabel,
  inputStyle,
  type Options,
} from './workspace-types'
export function TaskWorkspace({
  options,
  initialProject,
}: {
  options: Options
  initialProject?: string
}) {
  const [view, setView] = useQueryState('view', { defaultValue: 'open' }),
    [taskId, setTaskId] = useQueryState('task'),
    [project, setProject] = useQueryState('projectId', {
      defaultValue: initialProject ?? '',
    })
  const [search, setSearch] = useQueryState('search', {defaultValue:''}),
    [filters, setFilters] = useQueryStates({propertyId:parseAsString.withDefault(''),committeeId:parseAsString.withDefault(''),assigneeId:parseAsString.withDefault(''),priority:parseAsString.withDefault(''),status:parseAsString.withDefault(''),approval:parseAsString.withDefault('')}),
    [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1)),
    [data, setData] = useState<{ items: TaskRow[]; total: number }>({
      items: [],
      total: 0,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [creating, setCreating] = useState(false),
    [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      const p = new URLSearchParams({
        view,
        search,
        page: String(page),
        ...filters,
      })
      if (project) p.set('projectId', project)
      taskFetch<{ items: TaskRow[]; total: number }>('/api/tasks?' + p, {
        signal: controller.signal,
      })
        .then(setData)
        .catch((e) => {
          if (e.name !== 'AbortError') setError(e.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [view, search, filters, page, project, tick])
  const setFilter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }
  const choices = [
    ['open', 'Open tasks'],
    ['mine', 'Assigned to me'],
    ['overdue', 'Overdue'],
    ['approval', 'Awaiting approval'],
    ['completed', 'Completed'],
    ['all', 'All tasks'],
  ]
  const selectedProject = options.projects.find((p) => p.id === project)
  return (
    <div className="min-w-0 max-w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Task Manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedProject
              ? selectedProject.name
              : 'Across your properties. Clear ownership, from request to completion.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(options.actor.isAdmin ||
            options.actor.committeeIds.includes(
              options.actor.operationsCommitteeId,
            )) && (
            <Button variant="outline" asChild>
              <Link href="/tasks/routing">Route tasks</Link>
            </Button>
          )}
          {options.actor.isAdmin && (
            <Button variant="outline" asChild>
              <Link href="/tasks/committees">
                <Users className="mr-2 size-4" />
                Committees
              </Link>
            </Button>
          )}
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 size-4" />
            New task
          </Button>
        </div>
      </header>
      <nav
        aria-label="Task views"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {choices.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setView(key)
              setPage(1)
            }}
            className={`shrink-0 border-b-2 px-4 pb-3 pt-2 text-sm transition-colors ${view === key ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <section aria-label="Filter tasks" className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <input
              aria-label="Search tasks"
              placeholder="Search tasks…"
              className={inputStyle + ' pl-9'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select
            aria-label="Project"
            className={inputStyle + ' sm:w-52'}
            value={project}
            onChange={(e) => {
              setProject(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All projects</option>
            <option value="none">No project</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="outline" asChild>
            <Link href="/tasks/projects">
              <FolderOpen className="mr-2 size-4" />
              Projects
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="mr-1 size-4 text-muted-foreground" />
          {(
            [
              ['propertyId', 'All properties', options.properties],
              ['committeeId', 'All committees', options.committees],
              ['assigneeId', 'Anyone responsible', options.users],
              [
                'priority',
                'All priorities',
                ['high', 'medium', 'low'].map((id) => ({
                  id,
                  name: id[0].toUpperCase() + id.slice(1),
                })),
              ],
              [
                'status',
                'All statuses',
                ['todo', 'in_progress', 'stuck', 'done'].map((id) => ({
                  id,
                  name: statusLabel(id),
                })),
              ],
              [
                'approval',
                'All approvals',
                ['not_required', 'pending', 'approved', 'rejected'].map(
                  (id) => ({ id, name: statusLabel(id) }),
                ),
              ],
            ] as const
          ).map(([key, label, items]) => (
            <select
              key={key}
              aria-label={label}
              className={inputStyle + ' !h-9 !w-auto max-w-52 text-xs'}
              value={filters[key] ?? ''}
              onChange={(e) => setFilter(key, e.target.value)}
            >
              <option value="">{label}</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(null)
              setSearch('')
              setProject('')
              setPage(1)
            }}
          >
            Clear filters
          </Button>
        </div>
      </section>
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {loading
            ? 'Loading tasks…'
            : `${data.total} ${data.total === 1 ? 'task' : 'tasks'}`}
        </p>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 size-3.5" />
          Refresh
        </Button>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm"
        >
          {error}
          <Button variant="outline" className="ml-4" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : !loading && !data.items.length ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h2 className="font-medium">No tasks in this view</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust the filters, or add a task to get started.
          </p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            New task
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {[
                    'Task',
                    'Property',
                    'Project',
                    'Priority',
                    'Committee',
                    'Approval',
                    'Responsibility',
                    'Status',
                    'Raised',
                    'Age',
                    'Deadline',
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t align-top hover:bg-muted/30"
                  >
                    <td className="min-w-64 max-w-sm px-4 py-4">
                      <button
                        onClick={() => setTaskId(t.id)}
                        className="text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {t.title}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                      {t.property_name ?? '—'}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {t.project_name ?? '—'}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={
                          t.priority === 'high'
                            ? 'font-medium text-red-700 dark:text-red-400'
                            : ''
                        }
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="min-w-40 px-4 py-4">{t.committee_name}</td>
                    <td className="min-w-40 px-4 py-4">
                      <Approval value={t.approval} />
                    </td>
                    <td className="min-w-40 px-4 py-4">
                      {t.assignees.map((a) => a.name).join(', ') ||
                        'Unassigned'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {statusLabel(t.status)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString('en-GB', {
                        timeZone: 'Asia/Colombo',
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums text-muted-foreground">
                      {taskAge(t.created_at, t.completed_at)} days
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-4 ${reminderKind(t.due_date, t.status) === 'overdue' ? 'font-medium text-red-700 dark:text-red-400' : ''}`}
                    >
                      {t.due_date ?? 'No deadline'}
                      {reminderKind(t.due_date, t.status) === 'overdue' && (
                        <span className="block text-xs">Overdue</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {data.items.map((t) => (
              <button
                key={t.id}
                onClick={() => setTaskId(t.id)}
                className="block w-full rounded-lg border p-4 text-left"
              >
                <div className="mb-2 flex justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t.property_name ?? 'No property'} · {t.priority} priority
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </div>
                <h2 className="font-medium">{t.title}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Approval value={t.approval} />
                  <span>{statusLabel(t.status)}</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t.committee_name} ·{' '}
                  {t.assignees.map((a) => a.name).join(', ') || 'Unassigned'}
                </p>
                <p className="mt-2 text-xs">
                  {t.due_date ? `Due ${t.due_date}` : 'No deadline'} ·{' '}
                  {taskAge(t.created_at, t.completed_at)} days open
                </p>
              </button>
            ))}
          </div>
        </>
      )}
      <footer className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} of {Math.max(1, Math.ceil(data.total / 30))}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 30 >= data.total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </footer>
      <TaskCreateDialog
        options={options}
        open={creating}
        onOpenChange={setCreating}
        projectId={project === 'none' ? '' : project}
        onCreated={(id) => {
          refresh()
          setTaskId(id)
        }}
      />
      <TaskDetailPanel
        id={taskId}
        options={options}
        onClose={() => setTaskId(null)}
        onChange={refresh}
      />
    </div>
  )
}
export function Approval({ value }: { value: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-xs ${value === 'pending' ? 'bg-amber-100 text-amber-900' : value === 'rejected' ? 'bg-red-100 text-red-900' : value === 'approved' ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-muted-foreground'}`}
    >
      {statusLabel(value)}
    </span>
  )
}
