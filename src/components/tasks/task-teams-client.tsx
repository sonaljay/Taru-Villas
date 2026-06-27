'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
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
import type { TaskTeam } from '@/lib/db/schema'

interface Props {
  teams: TaskTeam[]
}

export function TaskTeamsClient({ teams: initialTeams }: Props) {
  const router = useRouter()
  const [teams, setTeams] = useState(initialTeams)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingTeam, setDeletingTeam] = useState<TaskTeam | null>(null)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const res = await fetch('/api/tasks/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to create team')
      return
    }
    const created = await res.json()
    setTeams([...teams, created])
    setNewName('')
    setAdding(false)
    router.refresh()
  }

  async function handleRename(id: string) {
    const name = editName.trim()
    if (!name) return
    const res = await fetch(`/api/tasks/teams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to rename team')
      return
    }
    const updated = await res.json()
    setTeams(teams.map((t) => (t.id === id ? { ...t, name: updated.name } : t)))
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(team: TaskTeam) {
    const res = await fetch(`/api/tasks/teams/${team.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to delete team')
      setDeletingTeam(null)
      return
    }
    setTeams(teams.filter((t) => t.id !== team.id))
    setDeletingTeam(null)
    toast.success(`Team "${team.name}" deleted`)
    router.refresh()
  }

  return (
    <>
      <div className="max-w-2xl space-y-3">
        <div className="rounded-lg border bg-card">
          {teams.length === 0 && !adding && (
            <p className="p-6 text-sm text-muted-foreground">No teams yet. Add one below.</p>
          )}
          <ul>
            {teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center gap-2 border-b p-3 last:border-b-0"
              >
                {editingId === team.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(team.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      className="flex-1"
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleRename(team.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{team.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(team.id)
                        setEditName(team.name)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingTeam(team)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {adding && (
            <div className="flex items-center gap-2 border-t p-3">
              <Input
                placeholder="Team name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setNewName('')
                  }
                }}
                autoFocus
                className="flex-1"
              />
              <Button size="sm" onClick={handleCreate}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName('') }}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add team
          </Button>
        )}
      </div>

      <AlertDialog open={!!deletingTeam} onOpenChange={(open) => !open && setDeletingTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deletingTeam?.name}&quot;. Tasks assigned to this
              team will be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deletingTeam && handleDelete(deletingTeam)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
