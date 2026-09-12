'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

type Reason = { id: string; name: string; isActive: boolean; sortOrder: number }
type Category = { id: string; primaryReasonId: string; name: string; isActive: boolean; sortOrder: number }

async function request(url: string, method: 'POST' | 'PATCH', body: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to save visit report categories')
  return payload
}

export function VisitReportCategoriesClient({ initialReasons, initialCategories }: { initialReasons: Reason[]; initialCategories: Category[] }) {
  const router = useRouter()
  const [reasons, setReasons] = useState(initialReasons)
  const [categories, setCategories] = useState(initialCategories)
  const [newReasonName, setNewReasonName] = useState('')
  const [newCategory, setNewCategory] = useState({ primaryReasonId: initialReasons[0]?.id ?? '', name: '' })
  const [pending, setPending] = useState(false)

  async function addReason() {
    if (!newReasonName.trim()) return
    setPending(true)
    try {
      const created = await request('/api/fleet/visit-report-categories', 'POST', { entity: 'reason', name: newReasonName.trim(), sortOrder: reasons.length * 10 + 10 }) as Reason
      setReasons((current) => [...current, created])
      setNewReasonName('')
      toast.success('Primary visit reason added')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add primary reason') } finally { setPending(false) }
  }

  async function addCategory() {
    if (!newCategory.primaryReasonId || !newCategory.name.trim()) return
    setPending(true)
    try {
      const created = await request('/api/fleet/visit-report-categories', 'POST', { entity: 'category', primaryReasonId: newCategory.primaryReasonId, name: newCategory.name.trim(), sortOrder: categories.filter((category) => category.primaryReasonId === newCategory.primaryReasonId).length * 10 + 10 }) as Category
      setCategories((current) => [...current, created])
      setNewCategory((current) => ({ ...current, name: '' }))
      toast.success('Observation category added')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add observation category') } finally { setPending(false) }
  }

  async function saveReason(reason: Reason) {
    setPending(true)
    try {
      const updated = await request('/api/fleet/visit-report-categories', 'PATCH', { entity: 'reason', ...reason }) as Reason
      setReasons((current) => current.map((item) => item.id === updated.id ? updated : item))
      toast.success('Primary visit reason saved')
      router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save primary reason') } finally { setPending(false) }
  }

  async function saveCategory(category: Category) {
    setPending(true)
    try {
      const updated = await request('/api/fleet/visit-report-categories', 'PATCH', { entity: 'category', ...category }) as Category
      setCategories((current) => current.map((item) => item.id === updated.id ? updated : item))
      toast.success('Observation category saved')
      router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save observation category') } finally { setPending(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">Visit Report Categories</h1><p className="text-muted-foreground">Manage primary visit reasons and the findings categories available under each reason.</p></div>
    <Card><CardHeader><CardTitle>Add primary visit reason</CardTitle><CardDescription>Inactive reasons remain on historical reports but cannot be selected for a new report.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row"><Input value={newReasonName} maxLength={255} placeholder="e.g. Operations" onChange={(event) => setNewReasonName(event.target.value)} /><Button type="button" disabled={pending || !newReasonName.trim()} onClick={addReason}><Plus className="size-4" />Add reason</Button></CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Primary visit reasons</CardTitle><CardDescription>Control the first selection on every visit report.</CardDescription></CardHeader><CardContent className="space-y-4">{reasons.map((reason) => <div key={reason.id} className="grid gap-3 rounded-lg border p-3"><div className="grid gap-3 sm:grid-cols-[1fr_100px]"><div className="space-y-1"><Label htmlFor={`reason-${reason.id}`}>Name</Label><Input id={`reason-${reason.id}`} maxLength={255} value={reason.name} disabled={pending} onChange={(event) => setReasons((current) => current.map((item) => item.id === reason.id ? { ...item, name: event.target.value } : item))} /></div><div className="space-y-1"><Label htmlFor={`reason-order-${reason.id}`}>Order</Label><Input id={`reason-order-${reason.id}`} type="number" min={0} value={reason.sortOrder} disabled={pending} onChange={(event) => setReasons((current) => current.map((item) => item.id === reason.id ? { ...item, sortOrder: Number(event.target.value) || 0 } : item))} /></div></div><div className="flex items-center justify-between"><Label htmlFor={`reason-active-${reason.id}`}>Available for new reports</Label><Switch id={`reason-active-${reason.id}`} checked={reason.isActive} disabled={pending} onCheckedChange={(isActive) => setReasons((current) => current.map((item) => item.id === reason.id ? { ...item, isActive } : item))} /></div><Button type="button" variant="outline" size="sm" disabled={pending || !reason.name.trim()} onClick={() => saveReason(reason)}><Save className="size-4" />Save</Button></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Observation categories</CardTitle><CardDescription>These choices are filtered by the primary visit reason in the report.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 rounded-lg border border-dashed p-3"><Select value={newCategory.primaryReasonId} onValueChange={(primaryReasonId) => setNewCategory((current) => ({ ...current, primaryReasonId }))}><SelectTrigger><SelectValue placeholder="Primary reason" /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason.id} value={reason.id}>{reason.name}</SelectItem>)}</SelectContent></Select><div className="flex gap-2"><Input value={newCategory.name} maxLength={255} placeholder="Add observation category" onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))} /><Button type="button" size="icon" aria-label="Add observation category" disabled={pending || !newCategory.name.trim() || !newCategory.primaryReasonId} onClick={addCategory}><Plus className="size-4" /></Button></div></div>{categories.map((category) => <div key={category.id} className="grid gap-3 rounded-lg border p-3"><Select value={category.primaryReasonId} disabled={pending} onValueChange={(primaryReasonId) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, primaryReasonId } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason.id} value={reason.id}>{reason.name}</SelectItem>)}</SelectContent></Select><div className="grid gap-3 sm:grid-cols-[1fr_100px]"><Input maxLength={255} value={category.name} disabled={pending} onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} /><Input type="number" min={0} value={category.sortOrder} disabled={pending} onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, sortOrder: Number(event.target.value) || 0 } : item))} /></div><div className="flex items-center justify-between"><Label htmlFor={`category-active-${category.id}`}>Available for new reports</Label><Switch id={`category-active-${category.id}`} checked={category.isActive} disabled={pending} onCheckedChange={(isActive) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, isActive } : item))} /></div><Button type="button" variant="outline" size="sm" disabled={pending || !category.name.trim()} onClick={() => saveCategory(category)}><Save className="size-4" />Save</Button></div>)}</CardContent></Card>
    </div>
  </div>
}
