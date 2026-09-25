import { describe, it, expect } from 'vitest'
import { checkTransition } from './transitions'
const t = { status: 'todo', approval: 'pending', approval_cycle: 1, version: 2 }
describe('approval transition guard', () => {
  it.each(['in_progress', 'done'])('blocks %s pending approval', (status) =>
    expect(() => checkTransition(t, { type: 'progress', status }, 2)).toThrow(
      /approval/i,
    ),
  )
  it('rejects stale edits', () =>
    expect(() => checkTransition(t, { type: 'edit' }, 1)).toThrow(/changed/i))
  it('rejects stale decisions', () =>
    expect(() => checkTransition(t, { type: 'decide', cycle: 0 }, 2)).toThrow(
      /review/i,
    ))
  it('requires reopen before transfer', () =>
    expect(() =>
      checkTransition({ ...t, status: 'done' }, { type: 'transfer' }, 2),
    ).toThrow(/reopen/i))
  it('permits explicit resume after approval', () =>
    expect(() =>
      checkTransition(
        { ...t, approval: 'approved', status: 'stuck' },
        { type: 'progress', status: 'in_progress' },
        2,
      ),
    ).not.toThrow())
})
