'use client'

import { useSaveProtection, usePortalRouter, useUnsavedChanges } from '@/hooks/use-unsaved-changes'

import { DiscardButton } from '@/components/ui/discard-button'

import { Field } from '@/components/ui/field'

import { useMemo, useState } from 'react'

import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface AssignmentEditDialogProps {
  cycleId: string
  version: number
  assignment: {
    id: string
    dutyPropertyId: string
    roleId: string
    dutyCode: string
    shiftTemplateId: string | null
    explanation: string
  }
  qualifiedRoleIds: string[]
  properties: Array<{ id: string; name: string; kind: 'hub' | 'spoke' }>
  roles: Array<{ id: string; code: string; name: string }>
  shiftTemplates: Array<{
    id: string
    code: string
    roleId: string
    workingMinutes: number
    segments: Array<{
      startTime: string
      endTime: string
      endsNextDay: boolean
    }>
  }>
}

export function AssignmentEditDialog({
  cycleId,
  version,
  assignment,
  qualifiedRoleIds,
  properties,
  roles,
  shiftTemplates,
}: AssignmentEditDialogProps) {
  const router = usePortalRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const releaseSaveProtection = useSaveProtection(saving)

  const [dutyPropertyId, setDutyPropertyId] = useState(
    assignment.dutyPropertyId,
  )
  const [roleId, setRoleId] = useState(assignment.roleId)
  const [dutyCode, setDutyCode] = useState<'W' | 'S'>(
    assignment.dutyCode === 'S' ? 'S' : 'W',
  )
  const [shiftTemplateId, setShiftTemplateId] = useState(
    assignment.shiftTemplateId ?? '',
  )
  const [explanation, setExplanation] = useState(assignment.explanation)

  const initialSnapshot = JSON.stringify([assignment.dutyPropertyId, assignment.roleId, assignment.dutyCode === 'S' ? 'S' : 'W', assignment.shiftTemplateId ?? '', assignment.explanation])
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot)
  const snapshot = JSON.stringify([dutyPropertyId, roleId, dutyCode, shiftTemplateId, explanation])
  const { markSaved } = useUnsavedChanges(open && snapshot !== savedSnapshot)
  const [saveError, setSaveError] = useState('')

  const availableRoles = roles.filter((role) =>
    qualifiedRoleIds.includes(role.id),
  )
  const availableTemplates = useMemo(
    () => shiftTemplates.filter((template) => template.roleId === roleId),
    [roleId, shiftTemplates],
  )

  function chooseRole(value: string) {
    setRoleId(value)
    const nextTemplate = shiftTemplates.find(
      (template) => template.roleId === value,
    )
    setShiftTemplateId(nextTemplate?.id ?? '')
  }

  async function save() {
    setSaving(true)
    try {
      const response = await fetch(
        `/api/rostering/cycles/${cycleId}/assignments/${assignment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: version,
            dutyPropertyId,
            roleId,
            dutyCode,
            shiftTemplateId,
            explanation,
          }),
        },
      )
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) throw new Error(result.error ?? 'Assignment update failed')
      setSavedSnapshot(snapshot); releaseSaveProtection(); markSaved(); setSaveError('')
      toast.success('Assignment updated and demand rechecked')
      setOpen(false)
      router.refresh()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Assignment update failed')
      toast.error(
        error instanceof Error ? error.message : 'Assignment update failed',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={saving} className="w-full" variant="outline">
          <Pencil /> Edit assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        {saveError && <p role="alert" className="rounded-xl border border-destructive/40 p-4">{saveError}</p>}
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription>
            The server rechecks qualifications, leave, transport, weekly hours, and coverage before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="space-y-2">
            <Label>Duty property</Label>
            <Select disabled={saving} value={dutyPropertyId} onValueChange={setDutyPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name} · {property.kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="space-y-2">
            <Label>Duty type</Label>
            <Select disabled={saving}
              value={dutyCode}
              onValueChange={(value) => setDutyCode(value as 'W' | 'S')}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="W">W · Base/normal duty</SelectItem>
                <SelectItem value="S">S · Same-hub spoke duty</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="space-y-2">
            <Label>Role</Label>
            <Select disabled={saving} value={roleId} onValueChange={chooseRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name} · {role.code.replace(/^DEMO_/, '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="space-y-2">
            <Label>Shift template</Label>
            <Select disabled={saving} value={shiftTemplateId} onValueChange={setShiftTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                {availableTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.code} · {Math.round(template.workingMinutes / 60)}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="assignment-explanation">Audit explanation</Label>
            <Textarea disabled={saving}
              id="assignment-explanation"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Why is this manual change required?"
            />
          </div>
        </div>
        <DialogFooter>
          <DiscardButton disabled={saving} variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </DiscardButton>
          <Button
            onClick={save}
            disabled={
              saving ||
              !shiftTemplateId ||
              explanation.trim().length < 3 ||
              availableRoles.length === 0
            }
          >
            {saving && <Loader2 className="animate-spin" />}
            Save assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
