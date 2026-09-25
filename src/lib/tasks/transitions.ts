export function checkTransition(
  t: {
    version: number
    status: string
    approval: string
    approval_cycle: number
  },
  c: { type: string; status?: string; cycle?: number },
  expected: number,
) {
  if (t.version !== expected)
    throw Error('Task changed. Refresh before saving.')
  if (
    c.type === 'decide' &&
    (t.approval !== 'pending' || c.cycle !== t.approval_cycle)
  )
    throw Error('This review is no longer pending.')
  if (
    ['transfer', 'require_approval', 'resubmit'].includes(c.type) &&
    t.status === 'done'
  )
    throw Error('Reopen this task first.')
  if (
    c.type === 'progress' &&
    ['in_progress', 'done'].includes(c.status ?? '') &&
    !['not_required', 'approved'].includes(t.approval)
  )
    throw Error('Approval is required before starting or completing.')
  if (c.type === 'progress' && t.status === 'done' && c.status !== 'done')
    throw Error('Use Reopen to reopen a completed task.')
}
