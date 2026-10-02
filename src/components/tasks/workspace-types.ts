import type { Actor } from '@/lib/tasks/policy'
export type Choice = { id: string; name: string }
export type Committee = Choice & {
  is_operations: boolean
  member_ids: string[]
}
export type Options = {
  actor: Actor
  properties: Choice[]
  projects: Choice[]
  users: Choice[]
  committees: Committee[]
}
export const inputStyle =
  'portal-field min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
export async function taskFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(url, init)
  const b = await r.json()
  if (!r.ok) throw Error(b.error ?? 'Unable to complete request')
  return b
}
export const jsonRequest = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export const statusLabel = (status: string) =>
  ({
    todo: 'Not started',
    in_progress: 'In progress',
    stuck: 'On hold',
    done: 'Completed',
    pending: 'Awaiting approval',
    not_required: 'Not required',
    approved: 'Approved',
    rejected: 'Rejected',
  })[status] ?? status
