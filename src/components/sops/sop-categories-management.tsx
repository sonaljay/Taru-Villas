'use client'

import { useState, useTransition } from 'react'
import { GripVertical, Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { SopCategoryWithCount } from '@/lib/db/queries/categories'

interface Props {
  initialCategories: SopCategoryWithCount[]
}

export function SopCategoriesManagement({ initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const res = await fetch('/api/sops/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to create category')
      return
    }
    const created = await res.json()
    setCategories([...categories, { ...created, templateCount: 0 }])
    setNewName('')
    setAdding(false)
  }

  async function handleRename(id: string) {
    const name = editName.trim()
    if (!name) return
    const res = await fetch(`/api/sops/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to rename category')
      return
    }
    const updated = await res.json()
    setCategories(categories.map((c) => (c.id === id ? { ...c, name: updated.name } : c)))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    const cat = categories.find((c) => c.id === id)
    if (!cat) return
    if (cat.templateCount > 0) {
      toast.error(`${cat.templateCount} template(s) use this category. Reassign them first.`)
      return
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return
    const res = await fetch(`/api/sops/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast.error(`${body.templateCount ?? 'Some'} template(s) use this category. Reassign them first.`)
      } else {
        toast.error(body.error ?? 'Failed to delete category')
      }
      return
    }
    setCategories(categories.filter((c) => c.id !== id))
  }

  async function persistOrder(next: SopCategoryWithCount[]) {
    const order = next.map((c) => c.id)
    const res = await fetch('/api/sops/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) {
      toast.error('Failed to save order')
    }
  }

  function handleDragStart(id: string) {
    setDraggingId(id)
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    if (!draggingId || draggingId === overId) return
    const next = [...categories]
    const fromIdx = next.findIndex((c) => c.id === draggingId)
    const toIdx = next.findIndex((c) => c.id === overId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setCategories(next)
  }

  function handleDragEnd() {
    if (draggingId) {
      startTransition(() => persistOrder(categories))
    }
    setDraggingId(null)
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-lg border bg-card">
        {categories.length === 0 && !adding && (
          <p className="p-6 text-sm text-muted-foreground">No categories yet. Add one below.</p>
        )}
        <ul>
          {categories.map((cat) => (
            <li
              key={cat.id}
              draggable
              onDragStart={() => handleDragStart(cat.id)}
              onDragOver={(e) => handleDragOver(e, cat.id)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-2 border-b p-3 last:border-b-0"
            >
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
              {editingId === cat.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(cat.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button size="sm" variant="ghost" onClick={() => handleRename(cat.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{cat.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {cat.templateCount}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(cat.id)
                      setEditName(cat.name)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(cat.id)}
                    disabled={cat.templateCount > 0}
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
              placeholder="Category name"
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
          <Plus className="mr-1 h-4 w-4" /> Add category
        </Button>
      )}
    </div>
  )
}
