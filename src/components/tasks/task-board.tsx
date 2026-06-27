'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { STATUSES, STATUS_META, type TaskStatus } from './task-meta'
import { TaskCard } from './task-card'
import type { TaskWithRelations } from '@/lib/db/queries/tasks'

export function TaskBoard({ tasks, onEdit }: { tasks: TaskWithRelations[]; onEdit: (t: TaskWithRelations) => void }) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)

  async function drop(status: TaskStatus) {
    const id = dragId
    setDragId(null); setOverCol(null)
    if (!id) return
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === status) return
    const position = tasks.filter((t) => t.status === status).length
    try {
      const res = await fetch(`/api/tasks/${id}/reorder`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, position }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      toast.error('Could not move task')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATUSES.map((status) => {
        const col = tasks.filter((t) => t.status === status)
        return (
          <div key={status}
            onDragOver={(e) => { e.preventDefault(); setOverCol(status) }}
            onDrop={() => drop(status)}
            className={`flex min-h-24 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors ${overCol === status ? 'ring-2 ring-primary/40' : ''}`}>
            <div className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
              <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
              {STATUS_META[status].label}
              <span className="ml-auto text-xs text-muted-foreground">{col.length}</span>
            </div>
            {col.map((t) => (
              <TaskCard key={t.id} task={t} draggable
                onDragStart={() => setDragId(t.id)} onClick={() => onEdit(t)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
