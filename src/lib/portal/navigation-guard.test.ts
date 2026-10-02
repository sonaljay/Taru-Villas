import { expect, it } from 'vitest'
import { isSameDocumentNavigation, withHistoryIndex, restoreHistoryDelta } from './navigation-guard'
it('skips same-document hash navigation but catches changes of query or path', () => {
  expect(isSameDocumentNavigation('https://portal.test/tasks?a=1', 'https://portal.test/tasks?a=1#notes')).toBe(true)
  expect(isSameDocumentNavigation('https://portal.test/tasks?a=1', 'https://portal.test/tasks?a=2')).toBe(false)
  expect(isSameDocumentNavigation('https://portal.test/tasks', 'https://other.test/tasks')).toBe(false)
})
it('preserves router history state and restores cancelled Back and Forward', () => {
  const state = { __NA: true, tree: ['tasks'], privateKey: 5 }
  expect(withHistoryIndex(state, 3)).toEqual({ ...state, __taruPortalHistoryIndex: 3 })
  expect(restoreHistoryDelta(3, 2)).toBe(1)
  expect(restoreHistoryDelta(2, 3)).toBe(-1)
  expect(restoreHistoryDelta(3, undefined)).toBeNull()
})
