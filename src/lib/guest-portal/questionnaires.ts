import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod/v4'
import { db } from '@/lib/db'
import { preArrivalQuestions, preArrivalAnswers, preArrivalSubmissions, guestProfiles, guestPortalUploads } from '@/lib/db/schema'
import { getProfile } from '@/lib/auth/guards'
import { requireLoPropertyAccess } from '@/lib/oracle/access'
import { validOracleDate } from '@/lib/oracle/reservations'
import { withGuestAction, withStaffGuestBooking } from './access'
import { GuestInputError, type GuestScope, type PublicQuestion, type QuestionnaireInput } from './types'
export const questionnaireInputSchema = z.object({ submissionId: z.uuid(), answers: z.array(z.object({ questionId: z.uuid(), text: z.string().max(4000).optional(), options: z.array(z.string().max(100)).max(20).optional(), uploadId: z.uuid().optional() }).strict()).max(100) }).strict()
export function questionnaireHash(answers: QuestionnaireInput['answers']) {
  return createHash('sha256').update(JSON.stringify(answers.map(a => ({ questionId: a.questionId, text: a.text?.trim() ?? null, options: [...(a.options ?? [])].sort(), uploadId: a.uploadId ?? null })).sort((a,b) => a.questionId.localeCompare(b.questionId)))).digest('hex')
}
export function validateQuestionnaireAnswers(questions: PublicQuestion[], answers: QuestionnaireInput['answers']) {
  const ids = new Set(questions.map(q => q.id)); const supplied = new Map(answers.map(a => [a.questionId, a]))
  if (supplied.size !== answers.length || answers.some(a => !ids.has(a.questionId))) throw new GuestInputError('Answer the current listed questions')
  return questions.flatMap(question => {
    const answer = supplied.get(question.id); const text = answer?.text?.trim() ?? ''; const options = answer?.options ?? []; const uploadId = answer?.uploadId
    const hasValue = !!text || options.length > 0 || !!uploadId
    if (!hasValue) { if (question.required) throw new GuestInputError(`Please answer: ${question.prompt}`); return [] }
    const invalid = () => { throw new GuestInputError(`Check your answer: ${question.prompt}`) }
    if (question.type === 'single_choice' || question.type === 'multi_choice') {
      if (text || uploadId || !options.length || (question.type === 'single_choice' && options.length !== 1) || new Set(options).size !== options.length || options.some(value => !question.options.includes(value))) invalid()
    } else if (question.type === 'file') {
      if (text || options.length || !uploadId || !z.uuid().safeParse(uploadId).success) invalid()
    } else {
      if (options.length || uploadId || !text) invalid()
      if (question.type === 'short_text' && text.length > 500) invalid()
      if (question.type === 'long_text' && text.length > 4000) invalid()
      if (question.type === 'date' && !validOracleDate(text)) invalid()
      if (question.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) invalid()
      if (question.type === 'yes_no' && !['yes','no'].includes(text)) invalid()
    }
    return [{ questionId: question.id, promptSnapshot: question.prompt, typeSnapshot: question.type, optionsSnapshot: question.options, valueText: text || null, valueOptions: options, uploadId: uploadId ?? null }]
  })
}
export async function submitQuestionnaire(scope: GuestScope, input: QuestionnaireInput): Promise<{ status: 'submitted' }> {
  const parsed = questionnaireInputSchema.safeParse(input); if (!parsed.success) throw new GuestInputError('Check your questionnaire answers')
  const hash = questionnaireHash(parsed.data.answers)
  return withGuestAction(scope, async (source, tx) => {
    const where = and(eq(preArrivalSubmissions.guestProfileId, source.id), eq(preArrivalSubmissions.orgId, source.orgId), eq(preArrivalSubmissions.propertyId, source.propertyId))
    const [existing] = await tx.select().from(preArrivalSubmissions).where(and(where, eq(preArrivalSubmissions.submissionId, input.submissionId))).limit(1)
    if (existing) { if (existing.payloadHash !== hash) throw new GuestInputError('This submission was already used for different answers', 409); return { status: 'submitted' as const } }
    if (source.questionnaireStatus !== 'not_started') throw new GuestInputError('Your questionnaire has already been submitted', 409)
    const questions = await tx.select().from(preArrivalQuestions).where(and(eq(preArrivalQuestions.orgId, scope.orgId), eq(preArrivalQuestions.propertyId, scope.propertyId), eq(preArrivalQuestions.isActive, true))).orderBy(asc(preArrivalQuestions.sortOrder)).for('share')
    const answers = validateQuestionnaireAnswers(questions, parsed.data.answers)
    const uploadIds = answers.flatMap(a => a.uploadId ? [a.uploadId] : [])
    if (uploadIds.length) {
      const uploads = await tx.select().from(guestPortalUploads).where(and(inArray(guestPortalUploads.id, uploadIds), eq(guestPortalUploads.orgId, scope.orgId), eq(guestPortalUploads.propertyId, scope.propertyId), eq(guestPortalUploads.guestProfileId, scope.guestProfileId), eq(guestPortalUploads.accessId, scope.accessId), eq(guestPortalUploads.state, 'draft'))).for('update')
      if (uploads.length !== new Set(uploadIds).size || new Set(uploadIds).size !== uploadIds.length) throw new GuestInputError('Choose a file uploaded for this stay')
    }
    const [submission] = await tx.insert(preArrivalSubmissions).values({ orgId: source.orgId, propertyId: source.propertyId, guestProfileId: source.id, submissionId: input.submissionId, payloadHash: hash }).returning()
    if (answers.length) await tx.insert(preArrivalAnswers).values(answers.map(a => ({ ...a, guestProfileId: source.id, submissionId: submission.id }))).returning()
    if (uploadIds.length) await tx.update(guestPortalUploads).set({ state: 'submitted', updatedAt: new Date() }).where(inArray(guestPortalUploads.id, uploadIds)).returning()
    await tx.update(guestProfiles).set({ questionnaireStatus: 'submitted', updatedAt: new Date() }).where(eq(guestProfiles.id, source.id)).returning()
    return { status: 'submitted' as const }
  })
}
export async function reviewQuestionnaire(guestProfileId: string): Promise<void> {
  await withStaffGuestBooking(guestProfileId, async (source, _writer, tx) => {
    if (source.questionnaireStatus !== 'submitted') throw new GuestInputError('There is no submitted questionnaire to review', 409)
    const actor = await getProfile()
    await tx.update(preArrivalSubmissions).set({ reviewedAt: new Date(), reviewedBy: actor!.id, updatedAt: new Date() }).where(and(eq(preArrivalSubmissions.orgId, source.orgId), eq(preArrivalSubmissions.propertyId, source.propertyId), eq(preArrivalSubmissions.guestProfileId, source.id))).returning()
    await tx.update(guestProfiles).set({ questionnaireStatus: 'reviewed', updatedAt: new Date() }).where(eq(guestProfiles.id, source.id)).returning()
  })
}
export async function getStaffQuestionnaire(guestProfileId: string) {
  return withStaffGuestBooking(guestProfileId, async (source, _writer, tx) => {
    const answers = await tx.select({ id: preArrivalAnswers.id, prompt: preArrivalAnswers.promptSnapshot, type: preArrivalAnswers.typeSnapshot, text: preArrivalAnswers.valueText, options: preArrivalAnswers.valueOptions, uploadId: preArrivalAnswers.uploadId }).from(preArrivalAnswers).where(eq(preArrivalAnswers.guestProfileId, source.id)).orderBy(asc(preArrivalAnswers.createdAt))
    return { guestName: source.guestName, status: source.questionnaireStatus, answers }
  })
}
export const questionDefinitionSchema = z.object({ prompt: z.string().trim().min(1).max(500), type: z.enum(['short_text','long_text','single_choice','multi_choice','date','time','yes_no','file']), options: z.array(z.string().trim().min(1).max(100)).max(20).default([]), required: z.boolean().default(false), mapsToEta: z.boolean().default(false), sortOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().default(true) }).strict()
export function validateQuestionDefinition(input: unknown) {
  const parsed = questionDefinitionSchema.safeParse(input); if (!parsed.success) throw new GuestInputError('Check the question definition')
  const value = parsed.data; const choices = ['single_choice','multi_choice'].includes(value.type)
  if ((choices && value.options.length < 1) || new Set(value.options).size !== value.options.length || (value.mapsToEta && value.type !== 'time') || (!choices && value.options.length)) throw new GuestInputError('Use distinct choices; only a time question may map to ETA')
  return value
}
export async function getPropertyQuestions(propertyId: string) { const scope = await requireLoPropertyAccess(propertyId); return db.select().from(preArrivalQuestions).where(and(eq(preArrivalQuestions.orgId, scope.orgId), eq(preArrivalQuestions.propertyId, propertyId))).orderBy(asc(preArrivalQuestions.sortOrder), desc(preArrivalQuestions.createdAt)) }
export async function savePropertyQuestion(propertyId: string, input: unknown, id?: string) {
  const scope = await requireLoPropertyAccess(propertyId); const actor = await getProfile(); if (actor?.role !== 'admin') throw new GuestInputError('Forbidden', 403)
  const value = validateQuestionDefinition(input)
  try {
    if (id) { const [row] = await db.update(preArrivalQuestions).set({ ...value, updatedAt: new Date() }).where(and(eq(preArrivalQuestions.id, id), eq(preArrivalQuestions.orgId, scope.orgId), eq(preArrivalQuestions.propertyId, propertyId))).returning(); if (!row) throw new GuestInputError('Question unavailable', 404); return row }
    return (await db.insert(preArrivalQuestions).values({ ...value, orgId: scope.orgId, propertyId }).returning())[0]
  } catch (error) { if ((error as { cause?: { code?: string }; code?: string }).cause?.code === '23505' || (error as { code?: string }).code === '23505') throw new GuestInputError('Only one active question can map to arrival time', 409); throw error }
}
export async function reorderPropertyQuestions(propertyId: string, ids: string[]) {
  const scope=await requireLoPropertyAccess(propertyId);if((await getProfile())?.role!=='admin')throw new GuestInputError('Forbidden',403)
  if(!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!z.uuid().safeParse(id).success))throw new GuestInputError('Check question order')
  await db.transaction(async tx=>{
    const rows=await tx.select().from(preArrivalQuestions).where(and(eq(preArrivalQuestions.orgId,scope.orgId),eq(preArrivalQuestions.propertyId,propertyId))).for('update')
    if(rows.length!==ids.length||rows.some(row=>!ids.includes(row.id)))throw new GuestInputError('Questions changed; refresh and try again',409)
    for(let index=0;index<ids.length;index++)await tx.update(preArrivalQuestions).set({sortOrder:index,updatedAt:new Date()}).where(and(eq(preArrivalQuestions.id,ids[index]),eq(preArrivalQuestions.orgId,scope.orgId),eq(preArrivalQuestions.propertyId,propertyId))).returning()
  })
}
