import { describe, expect, it } from 'vitest'
import { acceptedDraftValues } from './survey-draft'

describe('accepted survey draft values', () => {
  it('does not treat notes on unanswered questions as saved', () => {
    const previous = { a: { score: null, note: '', issueDescription: '' } }
    const sent = { a: { score: null, note: 'Still being written', issueDescription: '' } }
    expect(acceptedDraftValues(previous, sent)).toEqual(previous)
  })
  it('records only the submitted snapshot of answered questions', () => {
    const previous = { a: { score: null, note: '', issueDescription: '' } }
    const sent = { a: { score: 4, note: 'Saved note', issueDescription: '' } }
    expect(acceptedDraftValues(previous, sent)).toEqual(sent)
  })
})
