import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '..'
import { dispatches, dispatchStops, fleetRequests, fleetTripReportObservations, fleetTripReports, fleetReportTaskLinks, profiles, projects, properties, taskAssignees, tasks, visitReportObservationCategories, visitReportReasons } from '../schema'
import { reportDeadline, isReportEditingOpen, visitReportSubmissionSchema, visitReportDraftSchema, type VisitReportSubmission, type VisitReportDraft } from '../../fleet/reports'
import { getVisitReportTaxonomy } from './visit-report-categories'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export class VisitReportError extends Error {}

export async function ensureTripReportForRequestInTransaction(tx: Transaction, requestId: string, completedAt?: Date) {
  const [request] = await tx.select().from(fleetRequests).where(eq(fleetRequests.id, requestId)).for('update')
  if (!request || request.status === 'cancelled') return null
  const [existing] = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))
  const dueAt = completedAt ? reportDeadline(completedAt) : null
    const dueDate = dueAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dueAt) : null
    const description = dueAt
      ? `Submit the visit report within 48 hours. Due ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(dueAt)} Sri Lanka time.\nReport: /fleet/reports/${request.id}`
      : `Draft your visit report now. The deadline starts after trip completion: submit within 48 hours.\nReport: /fleet/reports/${request.id}`
  if (existing) {
      // Reassignment/approval must not duplicate the task or discard a draft.
      // Completion starts the clock once, without changing historic deadlines.
      if (dueAt && !existing.dueAt && !existing.submittedAt) {
        await tx.update(fleetTripReports).set({ dueAt, updatedAt: new Date() }).where(eq(fleetTripReports.id, existing.id)).returning()
        if (existing.reportingTaskId) await tx.update(tasks).set({ dueDate, description, updatedAt: new Date() }).where(eq(tasks.id, existing.reportingTaskId)).returning()
      }
    return existing
  }
    const ownerId = request.reportOwnerId ?? request.requestedBy
    // Keep responsibility if deactivated after booking; never silently reassign.
    const [owner] = await tx.select().from(profiles).where(and(eq(profiles.id, ownerId), eq(profiles.orgId, request.orgId)))
    if (!owner) throw new VisitReportError('Report owner must belong to the ride organization')
    const [property] = request.targetPropertyId ? await tx.select().from(properties).where(and(eq(properties.id, request.targetPropertyId), eq(properties.orgId, request.orgId))) : []
    const [project] = await tx.insert(projects).values({ orgId: request.orgId, name: 'Visit Reports', description: 'Reports required within 48 hours of completing a ride.' })
      .onConflictDoUpdate({ target: [projects.orgId, projects.name], set: { status: 'active', updatedAt: new Date() } }).returning()
    const [task] = await tx.insert(tasks).values({ orgId: request.orgId, projectId: project.id,
      title: `Submit visit report — ${(property?.name ?? request.destinationText ?? 'Ride').slice(0, 200)} (${request.id.slice(0, 8)})`,
      description,
      dueDate, priority: 'high', propertyId: property?.id ?? null,
    }).returning()
    await tx.insert(taskAssignees).values({ taskId: task.id, profileId: ownerId }).returning()
    const [reason] = request.taskId ? await tx.select().from(tasks).where(and(eq(tasks.id, request.taskId), eq(tasks.orgId, request.orgId))) : []
    const [report] = await tx.insert(fleetTripReports).values({ orgId: request.orgId, requestId: request.id,
      taskId: reason?.id ?? null, reportingTaskId: task.id, submittedBy: ownerId, dueAt,
      details: { visitPurpose: request.purpose ?? '', visitLocation: property?.name ?? request.destinationText ?? '', visitDate: request.endDate },
    }).returning()
    if (reason) await tx.insert(fleetReportTaskLinks).values({ orgId: request.orgId, reportId: report.id, taskId: reason.id }).returning()
  return report
}

export async function ensureTripReportsInTransaction(tx: Transaction, dispatchId: string, completedAt?: Date) {
  const [dispatch] = await tx.select().from(dispatches).where(eq(dispatches.id, dispatchId))
  if (!dispatch) return []
  const requests = await tx.select({ id: fleetRequests.id }).from(fleetRequests).where(and(
    eq(fleetRequests.orgId, dispatch.orgId), ne(fleetRequests.status, 'cancelled'),
    inArray(fleetRequests.id, tx.select({ id: dispatchStops.requestId }).from(dispatchStops).where(eq(dispatchStops.dispatchId, dispatchId))),
  )).orderBy(asc(fleetRequests.id))
  const completionTime = dispatch.status === 'completed' ? dispatch.completedAt ?? completedAt : undefined
  return (await Promise.all(requests.map((request) => ensureTripReportForRequestInTransaction(tx, request.id, completionTime)))).filter((report): report is NonNullable<typeof report> => report !== null)
}

export async function ensureTripReportsForDispatch(dispatchId: string, completedAt: Date) {
  return db.transaction(tx => ensureTripReportsInTransaction(tx, dispatchId, completedAt))
}

export async function getTripReportForRequest(requestId: string, orgId: string) {
  const [report] = await db.select().from(fleetTripReports).where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.orgId, orgId))).limit(1)
  return report
}

export async function getVisitReportPage(requestId: string, orgId: string, userId: string) {
  const report = await getTripReportForRequest(requestId, orgId)
  if (!report) return null
  const [request] = await db.select().from(fleetRequests).where(and(eq(fleetRequests.id, requestId), eq(fleetRequests.orgId, orgId)))
  if (!request) return null
  const [links, taskOptions, projectOptions, people, observations, taxonomy] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId }).from(fleetReportTaskLinks)
      .innerJoin(tasks, eq(tasks.id, fleetReportTaskLinks.taskId)).where(and(eq(fleetReportTaskLinks.reportId, report.id), eq(tasks.orgId, orgId))),
    db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId }).from(tasks).where(and(eq(tasks.orgId, orgId), report.reportingTaskId ? ne(tasks.id, report.reportingTaskId) : undefined)).orderBy(asc(tasks.title)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.orgId, orgId), eq(projects.status, 'active'))).orderBy(asc(projects.name)),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true))).orderBy(asc(profiles.fullName)),
    db.select({ id: fleetTripReportObservations.id, categoryId: fleetTripReportObservations.categoryId, categoryName: fleetTripReportObservations.categoryName, finding: fleetTripReportObservations.finding, taskId: fleetTripReportObservations.taskId, taskTitle: tasks.title, taskProjectId: tasks.projectId })
      .from(fleetTripReportObservations).leftJoin(tasks, eq(tasks.id, fleetTripReportObservations.taskId))
      .where(eq(fleetTripReportObservations.reportId, report.id)).orderBy(asc(fleetTripReportObservations.createdAt)),
    getVisitReportTaxonomy(orgId),
  ])
  const linkedTasks = [...links]
  const original = taskOptions.find(t => t.id === report.taskId)
  if (original && !linkedTasks.some(t => t.id === original.id)) linkedTasks.push(original)
  const canEdit = report.submittedBy === userId && isReportEditingOpen(report.dueAt) && request.status !== 'cancelled'
  return { report, request, linkedTasks, taskOptions, projectOptions, people, observations, reasons: taxonomy.reasons, observationCategories: taxonomy.categories, canEdit, canSubmit: canEdit && request.status === 'completed' }
}

async function resolveReportCategories(tx: Transaction, orgId: string, primaryReasonId: string, observations: VisitReportSubmission['observations']) {
  const [reason] = await tx.select({ id: visitReportReasons.id, name: visitReportReasons.name, isActive: visitReportReasons.isActive })
    .from(visitReportReasons).where(and(eq(visitReportReasons.id, primaryReasonId), eq(visitReportReasons.orgId, orgId))).for('share')
  if (!reason || !reason.isActive) throw new VisitReportError('Choose an active primary visit reason')
  const categoryIds = [...new Set(observations.map((observation) => observation.categoryId))]
  const categories = categoryIds.length ? await tx.select({ id: visitReportObservationCategories.id, name: visitReportObservationCategories.name, isActive: visitReportObservationCategories.isActive })
    .from(visitReportObservationCategories)
    .where(and(eq(visitReportObservationCategories.orgId, orgId), eq(visitReportObservationCategories.primaryReasonId, reason.id), inArray(visitReportObservationCategories.id, categoryIds))).for('share') : []
  if (categories.length !== categoryIds.length || categories.some((category) => !category.isActive)) {
    throw new VisitReportError('Choose active observation categories for the selected primary visit reason')
  }
  return { reason, categoryNameById: new Map(categories.map((category) => [category.id, category.name])) }
}

async function assertTaskLinks(tx: Transaction, orgId: string, reportTaskId: string | null, observations: VisitReportSubmission['observations']) {
  const ids = [...new Set(observations.flatMap((observation) => observation.task.kind === 'existing' ? [observation.task.taskId] : []))]
  if (!ids.length) return ids
  if (reportTaskId && ids.includes(reportTaskId)) throw new VisitReportError('The reporting task cannot be linked to an observation')
  const available = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.orgId, orgId), inArray(tasks.id, ids))).for('share')
  if (available.length !== ids.length) throw new VisitReportError('Choose observation tasks in your organization')
  return ids
}

async function replaceReportObservations(
  tx: Transaction,
  reportId: string,
  orgId: string,
  observations: Array<{ id?: string; categoryId: string; finding: string; taskId: string | null }>,
  categoryNameById: Map<string, string>,
) {
  const existing = await tx.select({ id: fleetTripReportObservations.id }).from(fleetTripReportObservations)
    .where(and(eq(fleetTripReportObservations.reportId, reportId), eq(fleetTripReportObservations.orgId, orgId))).for('update')
  const existingIds = new Set(existing.map((observation) => observation.id))
  const retainedIds = new Set<string>()
  for (const observation of observations) {
    const categoryName = categoryNameById.get(observation.categoryId)
    if (!categoryName) throw new VisitReportError('Choose valid observation categories')
    if (observation.id) {
      if (!existingIds.has(observation.id)) throw new VisitReportError('Observation not found')
      retainedIds.add(observation.id)
      await tx.update(fleetTripReportObservations).set({ categoryId: observation.categoryId, categoryName, finding: observation.finding, taskId: observation.taskId, updatedAt: new Date() })
        .where(eq(fleetTripReportObservations.id, observation.id)).returning()
    } else {
      await tx.insert(fleetTripReportObservations).values({ orgId, reportId, categoryId: observation.categoryId, categoryName, finding: observation.finding, taskId: observation.taskId }).returning()
    }
  }
  const removedIds = existing.filter((observation) => !retainedIds.has(observation.id)).map((observation) => observation.id)
  if (removedIds.length) await tx.delete(fleetTripReportObservations).where(inArray(fleetTripReportObservations.id, removedIds)).returning()
}

export async function saveVisitReportDraftInTransaction(tx: Transaction, requestId: string, orgId: string, ownerId: string, input: unknown) {
  // Same request-first lock order as assignment/completion/cancellation.
  const [request] = await tx.select().from(fleetRequests).where(and(eq(fleetRequests.id, requestId), eq(fleetRequests.orgId, orgId))).for('update')
  if (!request || request.status === 'cancelled') throw new VisitReportError('The trip is unavailable or cancelled')
  const [report] = await tx.select().from(fleetTripReports).where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.orgId, orgId))).for('update')
  if (!report) throw new VisitReportError('Report not found')
  if (report.submittedBy !== ownerId) throw new VisitReportError('Only the report owner can save a draft')
  if (!isReportEditingOpen(report.dueAt)) throw new VisitReportError('The 48-hour editing window has closed. This report is read-only.')
  if (report.submittedAt) {
    const parsed = visitReportSubmissionSchema.safeParse(input)
    if (!parsed.success) throw new VisitReportError('Complete the required report fields before saving changes')
    const data = parsed.data
    // Revisions never repeat the submission's task-creation side effects.
    if (data.newTasks.length) throw new VisitReportError('Create additional follow-up tasks in Task Manager, then link them here')
    if (data.observations.some((observation) => observation.task.kind === 'new')) throw new VisitReportError('Create additional follow-up tasks in Task Manager, then link them to an observation')
    const categories = await resolveReportCategories(tx, orgId, data.primaryReasonId, data.observations)
    const observationTaskIds = await assertTaskLinks(tx, orgId, report.reportingTaskId, data.observations)
    const linkedIds = [...new Set([...data.linkedTaskIds, ...observationTaskIds, ...(report.taskId ? [report.taskId] : [])])]
    if (report.reportingTaskId && linkedIds.includes(report.reportingTaskId)) throw new VisitReportError('The reporting task cannot be a follow-up linked task')
    const validLinks = linkedIds.length ? await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.orgId, orgId), inArray(tasks.id, linkedIds))).for('share') : []
    if (validLinks.length !== linkedIds.length) throw new VisitReportError('Choose a linked task in your organization')
    // Keep existing links (including generated follow-ups) as report history.
    if (linkedIds.length) await tx.insert(fleetReportTaskLinks).values(linkedIds.map(taskId => ({ orgId, reportId: report.id, taskId })))
      .onConflictDoNothing({ target: [fleetReportTaskLinks.reportId, fleetReportTaskLinks.taskId] }).returning()
    await replaceReportObservations(tx, report.id, orgId, data.observations.map((observation) => ({
      id: observation.id, categoryId: observation.categoryId, finding: observation.finding,
      taskId: observation.task.kind === 'existing' ? observation.task.taskId : null,
    })), categories.categoryNameById)
    const [saved] = await tx.update(fleetTripReports).set({ summary: data.summary, primaryReasonId: categories.reason.id, primaryReasonName: categories.reason.name, details: data.details, openComments: data.openComments ?? null, attachmentUrls: data.attachmentUrls, draft: null, updatedAt: new Date() })
      .where(eq(fleetTripReports.id, report.id)).returning()
    return saved
  }
  const draft = visitReportDraftSchema.parse(input)
  const [saved] = await tx.update(fleetTripReports).set({ draft, updatedAt: new Date() }).where(eq(fleetTripReports.id, report.id)).returning()
  return saved
}

export async function saveVisitReportDraft(requestId: string, orgId: string, ownerId: string, input: unknown) {
  return db.transaction(tx => saveVisitReportDraftInTransaction(tx, requestId, orgId, ownerId, input))
}

export async function submitVisitReportInTransaction(tx: Transaction, requestId: string, orgId: string, ownerId: string, input: unknown) {
  const [request] = await tx.select().from(fleetRequests).where(and(eq(fleetRequests.id, requestId), eq(fleetRequests.orgId, orgId))).for('update')
  if (!request) throw new VisitReportError('Report not found')
  const [report] = await tx.select().from(fleetTripReports).where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.orgId, orgId))).for('update')
  if (!report) throw new VisitReportError('Report not found')
  if (report.submittedBy !== ownerId) throw new VisitReportError('Only the report owner can submit this report')
  // Row lock serializes submissions and retries, including new task creation.
  if (report.submittedAt) return report
  if (!isReportEditingOpen(report.dueAt)) throw new VisitReportError('The 48-hour editing window has closed. This report is read-only.')
  const data = visitReportSubmissionSchema.parse(input)
  if (request.status !== 'completed') throw new VisitReportError('The ride must be completed before reporting')
  const categories = await resolveReportCategories(tx, orgId, data.primaryReasonId, data.observations)
  const observationTaskIds = await assertTaskLinks(tx, orgId, report.reportingTaskId, data.observations)
  const linkedIds = [...new Set([...data.linkedTaskIds, ...observationTaskIds, ...(report.taskId ? [report.taskId] : [])])]
  if (report.reportingTaskId && linkedIds.includes(report.reportingTaskId)) throw new VisitReportError('The reporting task cannot be a follow-up linked task')
  const validLinks = linkedIds.length ? await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.orgId, orgId), inArray(tasks.id, linkedIds))).for('share') : []
  if (validLinks.length !== linkedIds.length) throw new VisitReportError('Choose a linked task in your organization')
  for (const follow of data.newTasks) {
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, follow.projectId), eq(projects.orgId, orgId), eq(projects.status, 'active'))).for('share')
    if (!project) throw new VisitReportError('Choose an active project in your organization')
    const ids = [...new Set(follow.assigneeIds)]
    const people = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true), inArray(profiles.id, ids))).for('share')
    if (people.length !== ids.length) throw new VisitReportError('Choose active assignees in your organization')
  }
  for (const observation of data.observations) {
    if (observation.task.kind !== 'new') continue
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, observation.task.task.projectId), eq(projects.orgId, orgId), eq(projects.status, 'active'))).for('share')
    if (!project) throw new VisitReportError('Choose an active project in your organization')
    const ids = [...new Set(observation.task.task.assigneeIds)]
    const people = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true), inArray(profiles.id, ids))).for('share')
    if (people.length !== ids.length) throw new VisitReportError('Choose active assignees in your organization')
  }
  for (const follow of data.newTasks) {
    const [task] = await tx.insert(tasks).values({ orgId, projectId: follow.projectId, title: follow.title,
      description: `${follow.description ?? ''}\nVisit report: /fleet/reports/${requestId}`.trim(), priority: follow.priority,
      dueDate: follow.dueDate ?? null, createdBy: ownerId, propertyId: request.targetPropertyId,
    }).returning()
    await tx.insert(taskAssignees).values([...new Set(follow.assigneeIds)].map(profileId => ({ taskId: task.id, profileId }))).returning()
    linkedIds.push(task.id)
  }
  const createdObservationTaskIds = new Map<number, string>()
  for (const [index, observation] of data.observations.entries()) {
    if (observation.task.kind !== 'new') continue
    const follow = observation.task.task
    const [task] = await tx.insert(tasks).values({ orgId, projectId: follow.projectId, title: follow.title,
      description: `${follow.description ?? ''}\nVisit report: /fleet/reports/${requestId}`.trim(), priority: follow.priority,
      dueDate: follow.dueDate ?? null, createdBy: ownerId, propertyId: request.targetPropertyId,
    }).returning()
    await tx.insert(taskAssignees).values([...new Set(follow.assigneeIds)].map(profileId => ({ taskId: task.id, profileId }))).returning()
    createdObservationTaskIds.set(index, task.id)
    linkedIds.push(task.id)
  }
  await replaceReportObservations(tx, report.id, orgId, data.observations.map((observation, index) => ({
    id: observation.id, categoryId: observation.categoryId, finding: observation.finding,
    taskId: observation.task.kind === 'existing' ? observation.task.taskId : observation.task.kind === 'new' ? createdObservationTaskIds.get(index) ?? null : null,
  })), categories.categoryNameById)
  if (linkedIds.length) await tx.insert(fleetReportTaskLinks).values(linkedIds.map(taskId => ({ orgId, reportId: report.id, taskId })))
    .onConflictDoNothing({ target: [fleetReportTaskLinks.reportId, fleetReportTaskLinks.taskId] }).returning()
  const now = new Date()
  const [saved] = await tx.update(fleetTripReports).set({ summary: data.summary, primaryReasonId: categories.reason.id, primaryReasonName: categories.reason.name, details: data.details, openComments: data.openComments ?? null, attachmentUrls: data.attachmentUrls, draft: null, submittedAt: now, updatedAt: now })
    .where(eq(fleetTripReports.id, report.id)).returning()
  if (report.reportingTaskId) await tx.update(tasks).set({ status: 'done', completedAt: now, updatedAt: now })
    .where(and(eq(tasks.id, report.reportingTaskId), eq(tasks.orgId, orgId))).returning()
  return saved
}

export async function submitTripReport(requestId: string, orgId: string, ownerId: string, data: unknown) {
  return db.transaction(tx => submitVisitReportInTransaction(tx, requestId, orgId, ownerId, data))
}
