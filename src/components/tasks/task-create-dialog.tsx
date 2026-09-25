'use client'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  type Options,
  inputStyle,
  taskFetch,
  jsonRequest,
} from './workspace-types'
export function TaskCreateDialog({
  options,
  open,
  onOpenChange,
  onCreated,
  projectId,
}: {
  options: Options
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (id: string) => void
  projectId: string
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [committee, setCommittee] = useState('')
  const canChoose =
    options.actor.isAdmin ||
    options.actor.committeeIds.includes(options.actor.operationsCommitteeId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Describe the work and who is responsible. A project is optional.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            const f = new FormData(e.currentTarget)
            try {
              const r = await taskFetch<{ id: string }>(
                '/api/tasks',
                jsonRequest({
                  title: f.get('title'),
                  description: f.get('description') || null,
                  propertyId: f.get('propertyId') || null,
                  projectId: f.get('projectId') || null,
                  priority: f.get('priority'),
                  dueDate: f.get('dueDate') || null,
                  committeeId: committee || null,
                  assigneeIds: f.getAll('assigneeIds'),
                }),
              )
              onOpenChange(false)
              setCommittee('')
              onCreated(r.id)
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="block space-y-1 text-sm">
            Task
            <input
              autoFocus
              name="title"
              required
              maxLength={1000}
              className={inputStyle}
              placeholder="What needs to be done?"
            />
          </label>
          <label className="block space-y-1 text-sm">
            Description
            <textarea
              name="description"
              rows={3}
              maxLength={30000}
              className={inputStyle + ' !h-auto py-2'}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['propertyId', 'Property', options.properties],
                ['projectId', 'Project (optional)', options.projects],
              ] as const
            ).map(([name, label, items]) => (
              <label key={name} className="space-y-1 text-sm">
                {label}
                <select
                  name={name}
                  defaultValue={name === 'projectId' ? projectId : ''}
                  className={inputStyle}
                >
                  <option value="">
                    {name === 'projectId' ? 'No project' : 'No property'}
                  </option>
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
                defaultValue="medium"
                className={inputStyle}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Deadline
              <input name="dueDate" type="date" className={inputStyle} />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            Committee
            <select
              value={committee}
              onChange={(e) => setCommittee(e.target.value)}
              disabled={!canChoose}
              className={inputStyle}
            >
              <option value="">Operations Committee (automatic)</option>
              {options.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {committee
              ? 'Approval will be required before work can start.'
              : 'Automatically routed to Operations. No approval required unless Operations requests it.'}
          </p>
          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-sm">Responsible users</legend>
            <div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto">
              {options.users.map((u) => (
                <label className="flex items-center gap-2 text-sm" key={u.id}>
                  <input type="checkbox" name="assigneeIds" value={u.id} />
                  {u.name}
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating…' : 'Create task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
