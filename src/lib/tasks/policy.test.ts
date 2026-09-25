import { describe, it, expect } from 'vitest'
import {
  canViewTask,
  canEditTask,
  canTransferTask,
  canDecideTask,
  canReviewTransfer,
} from './policy'
import { localDate, reminderKind, taskAge } from './dates'
const actor = {
  orgId: 'org',
  profileId: 'u',
  isAdmin: false,
  isActive: true,
  propertyIds: ['p'],
  committeeIds: [],
  operationsCommitteeId: 'ops',
}
const task = {
  orgId: 'org',
  propertyId: 'p',
  committeeId: 'c',
  assigneeIds: [],
  approval: 'pending' as const,
  status: 'todo' as const,
}
describe('task permissions', () => {
  it('property visibility does not grant editing', () => {
    expect(canViewTask(actor, task)).toBe(true)
    expect(canEditTask(actor, task)).toBe(false)
  })
  it('isolates organizations and inactive users', () => {
    for (const a of [
      { ...actor, orgId: 'x', isAdmin: true },
      { ...actor, isActive: false, isAdmin: true },
    ])
      expect(canViewTask(a, task)).toBe(false)
  })
  it('committee membership and assignment grant editing', () => {
    expect(canEditTask({ ...actor, committeeIds: ['c'] }, task)).toBe(true)
    expect(canEditTask(actor, { ...task, assigneeIds: ['u'] })).toBe(true)
  })
  it('admin cannot approve without owning committee membership', () => {
    expect(canDecideTask({ ...actor, isAdmin: true }, task)).toBe(false)
    expect(canDecideTask({ ...actor, committeeIds: ['c'] }, task)).toBe(true)
  })
  it('Operations can transfer without blanket editing or visibility', () => {
    const ops = { ...actor, propertyIds: [], committeeIds: ['ops'] }
    expect(canTransferTask(ops, task)).toBe(true)
    expect(canReviewTransfer(ops, task)).toBe(true)
    expect(canViewTask(ops, task)).toBe(false)
    expect(canEditTask(ops, task)).toBe(false)
  })
})
describe('Sri Lanka calendar dates', () => {
  it('changes date at local midnight', () =>
    expect(localDate(new Date('2026-01-01T18:30:00Z'))).toBe('2026-01-02'))
  it('reminds one day before and only overdue after deadline day', () => {
    expect(
      reminderKind('2026-01-02', 'todo', new Date('2026-01-01T03:00Z')),
    ).toBe('upcoming')
    expect(
      reminderKind('2026-01-02', 'todo', new Date('2026-01-02T03:00Z')),
    ).toBeNull()
    expect(
      reminderKind('2026-01-02', 'todo', new Date('2026-01-03T03:00Z')),
    ).toBe('overdue')
    expect(
      reminderKind('2026-01-02', 'done', new Date('2026-01-03T03:00Z')),
    ).toBeNull()
  })
  it('freezes age at completion', () =>
    expect(
      taskAge('2026-01-01T00:00Z', '2026-01-04T00:00Z', new Date('2026-02-01')),
    ).toBe(3))
})
