import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '..'
import {
  tasks,
  properties,
  profiles,
  surveyQuestions,
  surveySubmissions,
  surveyResponses,
  propertyAssignments,
  type Task,
  type NewTask,
} from '../schema'

// Alias for joining profiles a second time (submitter vs assignee)
const submitterProfiles = alias(profiles, 'submitter_profiles')

// ---------------------------------------------------------------------------
// Create tasks from a submitted survey
// ---------------------------------------------------------------------------

/**
 * For each response with score <= 6 and an issueDescription, create a task.
 * Looks up question text for title, property's primaryPmId for assignment,
 * and checks for repeat issues (existing closed tasks with same questionId + propertyId).
 */
export async function createTasksFromSubmission(
  submissionId: string,
  orgId: string,
  propertyId: string,
  responses: {
    responseId: string
    questionId: string
    score: number
    issueDescription?: string | null
  }[]
) {
  const lowScoreResponses = responses.filter(
    (r) => r.score <= 6 && r.issueDescription
  )

  if (lowScoreResponses.length === 0) return []

  // Look up question texts
  const questionIds = lowScoreResponses.map((r) => r.questionId)
  const questionRows = await db
    .select({ id: surveyQuestions.id, text: surveyQuestions.text })
    .from(surveyQuestions)
    .where(inArray(surveyQuestions.id, questionIds))

  const questionTextMap = new Map(questionRows.map((q) => [q.id, q.text]))

  // Look up property's primary PM
  const [prop] = await db
    .select({ primaryPmId: properties.primaryPmId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1)

  const assignedTo = prop?.primaryPmId ?? null

  // Check for repeat issues: existing closed tasks with same questionId + propertyId
  const existingClosedTasks = await db
    .select({ questionId: tasks.questionId })
    .from(tasks)
    .where(
      and(
        eq(tasks.propertyId, propertyId),
        eq(tasks.status, 'closed'),
        inArray(tasks.questionId, questionIds)
      )
    )

  const repeatQuestionIds = new Set(existingClosedTasks.map((t) => t.questionId))

  // Insert tasks
  const newTasks: NewTask[] = lowScoreResponses.map((r) => ({
    orgId,
    propertyId,
    submissionId,
    responseId: r.responseId,
    questionId: r.questionId,
    title: questionTextMap.get(r.questionId) ?? 'Issue flagged',
    description: r.issueDescription!,
    assignedTo,
    isRepeatIssue: repeatQuestionIds.has(r.questionId),
  }))

  const inserted = await db.insert(tasks).values(newTasks).returning()
  return inserted
}

// ---------------------------------------------------------------------------
// Get tasks for admin (all org tasks)
// ---------------------------------------------------------------------------

export interface TaskFilters {
  propertyId?: string
  status?: 'open' | 'investigating' | 'closed'
  isRepeatIssue?: boolean
}

export async function getTasksForAdmin(orgId: string, filters: TaskFilters = {}) {
  const conditions = [eq(tasks.orgId, orgId)]

  if (filters.propertyId) {
    conditions.push(eq(tasks.propertyId, filters.propertyId))
  }
  if (filters.status) {
    conditions.push(eq(tasks.status, filters.status))
  }
  if (filters.isRepeatIssue !== undefined) {
    conditions.push(eq(tasks.isRepeatIssue, filters.isRepeatIssue))
  }

  const rows = await db
    .select({
      id: tasks.id,
      orgId: tasks.orgId,
      propertyId: tasks.propertyId,
      submissionId: tasks.submissionId,
      responseId: tasks.responseId,
      questionId: tasks.questionId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      assignedTo: tasks.assignedTo,
      isRepeatIssue: tasks.isRepeatIssue,
      closingNotes: tasks.closingNotes,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      closedAt: tasks.closedAt,
      closedBy: tasks.closedBy,
      propertyName: properties.name,
      assigneeName: profiles.fullName,
      raisedByName: submitterProfiles.fullName,
    })
    .from(tasks)
    .innerJoin(properties, eq(tasks.propertyId, properties.id))
    .innerJoin(surveySubmissions, eq(tasks.submissionId, surveySubmissions.id))
    .leftJoin(profiles, eq(tasks.assignedTo, profiles.id))
    .leftJoin(submitterProfiles, eq(surveySubmissions.submittedBy, submitterProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))

  return rows
}

// ---------------------------------------------------------------------------
// Get tasks for a specific user (PM — only tasks for their assigned properties)
// ---------------------------------------------------------------------------

export async function getTasksForUser(userId: string, filters: TaskFilters = {}) {
  // Get user's assigned property IDs
  const assignments = await db
    .select({ propertyId: propertyAssignments.propertyId })
    .from(propertyAssignments)
    .where(eq(propertyAssignments.userId, userId))

  const propertyIds = assignments.map((a) => a.propertyId)
  if (propertyIds.length === 0) return []

  const conditions = [inArray(tasks.propertyId, propertyIds)]

  if (filters.propertyId) {
    conditions.push(eq(tasks.propertyId, filters.propertyId))
  }
  if (filters.status) {
    conditions.push(eq(tasks.status, filters.status))
  }
  if (filters.isRepeatIssue !== undefined) {
    conditions.push(eq(tasks.isRepeatIssue, filters.isRepeatIssue))
  }

  const rows = await db
    .select({
      id: tasks.id,
      orgId: tasks.orgId,
      propertyId: tasks.propertyId,
      submissionId: tasks.submissionId,
      responseId: tasks.responseId,
      questionId: tasks.questionId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      assignedTo: tasks.assignedTo,
      isRepeatIssue: tasks.isRepeatIssue,
      closingNotes: tasks.closingNotes,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      closedAt: tasks.closedAt,
      closedBy: tasks.closedBy,
      propertyName: properties.name,
      assigneeName: profiles.fullName,
      raisedByName: submitterProfiles.fullName,
    })
    .from(tasks)
    .innerJoin(properties, eq(tasks.propertyId, properties.id))
    .innerJoin(surveySubmissions, eq(tasks.submissionId, surveySubmissions.id))
    .leftJoin(profiles, eq(tasks.assignedTo, profiles.id))
    .leftJoin(submitterProfiles, eq(surveySubmissions.submittedBy, submitterProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))

  return rows
}

// ---------------------------------------------------------------------------
// Get a single task by ID with full details
// ---------------------------------------------------------------------------

export async function getTaskById(id: string) {
  const rows = await db
    .select({
      id: tasks.id,
      orgId: tasks.orgId,
      propertyId: tasks.propertyId,
      submissionId: tasks.submissionId,
      responseId: tasks.responseId,
      questionId: tasks.questionId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      assignedTo: tasks.assignedTo,
      isRepeatIssue: tasks.isRepeatIssue,
      closingNotes: tasks.closingNotes,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      closedAt: tasks.closedAt,
      closedBy: tasks.closedBy,
      propertyName: properties.name,
      questionText: surveyQuestions.text,
      assigneeName: profiles.fullName,
      submissionSlug: surveySubmissions.slug,
      responseScore: surveyResponses.score,
    })
    .from(tasks)
    .innerJoin(properties, eq(tasks.propertyId, properties.id))
    .innerJoin(surveyQuestions, eq(tasks.questionId, surveyQuestions.id))
    .innerJoin(surveySubmissions, eq(tasks.submissionId, surveySubmissions.id))
    .innerJoin(surveyResponses, eq(tasks.responseId, surveyResponses.id))
    .leftJoin(profiles, eq(tasks.assignedTo, profiles.id))
    .where(eq(tasks.id, id))
    .limit(1)

  if (!rows[0]) return null

  // If there's a closedBy, look up the closer's name separately
  const task = rows[0]
  let closerName: string | null = null
  if (task.closedBy) {
    const [closer] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, task.closedBy))
      .limit(1)
    closerName = closer?.fullName ?? null
  }

  return { ...task, closerName }
}

// ---------------------------------------------------------------------------
// Update task status
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating', 'closed'],
  investigating: ['closed'],
  closed: [],
}

export async function updateTaskStatus(
  id: string,
  newStatus: 'open' | 'investigating' | 'closed',
  closingNotes?: string,
  closedBy?: string
) {
  // Get current task
  const [current] = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1)

  if (!current) return null

  const allowed = VALID_TRANSITIONS[current.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${current.status} -> ${newStatus}`
    )
  }

  const now = new Date()
  const updateData: Partial<NewTask> & { closedAt?: Date | null; updatedAt: Date } = {
    status: newStatus,
    updatedAt: now,
  }

  if (newStatus === 'closed') {
    updateData.closingNotes = closingNotes ?? null
    updateData.closedAt = now
    updateData.closedBy = closedBy ?? null
  }

  const [updated] = await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, id))
    .returning()

  return updated
}
