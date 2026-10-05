import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth/guards', () => ({ getProfile: vi.fn() }))
vi.mock('./access', () => ({ withGuestAction: vi.fn(), withStaffGuestBooking: vi.fn() }))
import { validateQuestionnaireAnswers, questionnaireHash, validateQuestionDefinition } from './questionnaires'
import type { PublicQuestion, QuestionnaireInput } from './types'
function answerInput(type: string, answer: {text?:string;options?:readonly string[];uploadId?:string}): QuestionnaireInput['answers'][number] {return {questionId:type,text:answer.text,options:answer.options?[...answer.options]:undefined,uploadId:answer.uploadId}}
const q = (type: PublicQuestion['type'], required = true): PublicQuestion => ({ id: type, prompt: type, type, options: ['Car', 'Train'], required })
describe('eight pre-arrival controls', () => {
  it.each([
    ['short_text', { text: 'Hello' }], ['long_text', { text: 'Dietary preferences' }], ['date', { text: '2026-10-08' }], ['time', { text: '14:30' }], ['yes_no', { text: 'yes' }], ['single_choice', { options: ['Car'] }], ['multi_choice', { options: ['Car', 'Train'] }], ['file', { uploadId: '00000000-0000-4000-8000-000000000001' }],
  ] as const)('validates %s against the stored definition', (type, answer) => {
    const rows = validateQuestionnaireAnswers([q(type)], [answerInput(type,answer)]); expect(rows[0]).toMatchObject({ promptSnapshot: type, typeSnapshot: type, optionsSnapshot: ['Car', 'Train'] })
  })
  it.each([['date', { text: '2026-02-30' }], ['time', { text: '25:61' }], ['yes_no', { text: 'true' }], ['single_choice', { options: ['Plane'] }], ['single_choice', { options: ['Car', 'Train'] }], ['multi_choice', { options: ['Car', 'Car'] }], ['short_text', { text: 'x'.repeat(501) }], ['long_text', { text: 'x'.repeat(4001) }], ['file', { text: 'https://public-file.invalid/file.pdf' }]] as const)('rejects invalid %s answer', (type, answer) => expect(() => validateQuestionnaireAnswers([q(type)], [answerInput(type,answer)])).toThrow())
  it('rejects missing, duplicate, unknown and changed definitions', () => {
    expect(() => validateQuestionnaireAnswers([q('time')], [])).toThrow()
    expect(() => validateQuestionnaireAnswers([q('time')], [{ questionId: 'foreign', text: '14:30' }])).toThrow()
    expect(() => validateQuestionnaireAnswers([q('time')], [{ questionId: 'time', text: '14:30' }, { questionId: 'time', text: '14:30' }])).toThrow()
    expect(() => validateQuestionnaireAnswers([q('date')], [{ questionId: 'date', text: '14:30' }])).toThrow()
  })
  it('makes identical reordered submissions idempotent', () => {
    const a = [{ questionId: 'a', options: ['Train', 'Car'] }, { questionId: 'b', text: 'Hello' }]
    expect(questionnaireHash(a)).toBe(questionnaireHash([{ questionId: 'b', text: 'Hello' }, { questionId: 'a', options: ['Car', 'Train'] }]))
    expect(questionnaireHash(a)).not.toBe(questionnaireHash([{ questionId: 'b', text: 'Changed' }]))
  })
  it('requires listed unique choices and allows ETA only on a time question', () => {
    expect(() => validateQuestionDefinition({ prompt: 'Transport', type: 'single_choice', options: [], mapsToEta: false })).toThrow()
    expect(() => validateQuestionDefinition({ prompt: 'ETA', type: 'date', options: [], mapsToEta: true })).toThrow()
    expect(() => validateQuestionDefinition({ prompt: 'Transport', type: 'multi_choice', options: ['Car','Car'], mapsToEta: false })).toThrow()
    expect(validateQuestionDefinition({ prompt: 'ETA', type: 'time', options: [], mapsToEta: true })).toBeTruthy()
  })
})
