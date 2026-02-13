import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  getSubmissions,
  createSubmission,
  getTemplateById,
  type SubmissionFilters,
} from '@/lib/db/queries/surveys'
import { createTasksFromSubmission } from '@/lib/db/queries/tasks'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  score: z.number().int().min(0).max(10),
  note: z.string().max(1000).optional(),
  issueDescription: z.string().max(2000).optional(),
})

const createSubmissionSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  propertyId: z.string().uuid('Invalid property ID'),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Visit date must be YYYY-MM-DD format'),
  notes: z.string().max(2000).optional(),
  status: z.enum(['draft', 'submitted']).default('draft'),
  responses: z.array(responseSchema).min(1, 'At least one response is required'),
})

// ---------------------------------------------------------------------------
// GET /api/surveys
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId') ?? undefined
    const status = searchParams.get('status') as SubmissionFilters['status'] | undefined
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Build filters — all authenticated users can see all surveys
    const filters: SubmissionFilters = {}
    if (propertyId) filters.propertyId = propertyId
    if (status) filters.status = status

    let submissions = await getSubmissions(filters)

    // Apply client-side date range filtering if provided
    if (dateFrom) {
      submissions = submissions.filter((s) => s.visitDate >= dateFrom)
    }
    if (dateTo) {
      submissions = submissions.filter((s) => s.visitDate <= dateTo)
    }

    return NextResponse.json(submissions)
  } catch (error) {
    console.error('GET /api/surveys error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/surveys
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createSubmissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { templateId, propertyId, visitDate, notes, status, responses } = parsed.data

    const submission = await createSubmission({
      submission: {
        templateId,
        propertyId,
        submittedBy: profile.id,
        visitDate,
        notes: notes ?? null,
        status,
        submittedAt: status === 'submitted' ? new Date() : null,
      },
      responses: responses.map((r) => ({
        questionId: r.questionId,
        score: r.score,
        note: r.note ?? null,
        issueDescription: r.issueDescription ?? null,
      })),
    })

    // If submitted as final, check if it's an internal survey and create tasks for low scores
    if (status === 'submitted') {
      try {
        const template = await getTemplateById(templateId)
        if (template && template.surveyType === 'internal') {
          // Get the created responses from DB to get their IDs
          const { getSubmissionById } = await import('@/lib/db/queries/surveys')
          const fullSubmission = await getSubmissionById(submission.id)
          if (fullSubmission?.responses) {
            const taskResponses = fullSubmission.responses
              .filter((r) => r.score <= 6 && r.issueDescription)
              .map((r) => ({
                responseId: r.id,
                questionId: r.questionId,
                score: r.score,
                issueDescription: r.issueDescription,
              }))

            if (taskResponses.length > 0) {
              await createTasksFromSubmission(
                submission.id,
                profile.orgId,
                propertyId,
                taskResponses
              )
            }
          }
        }
      } catch (taskError) {
        console.error('Failed to create tasks from submission:', taskError)
        // Don't fail the submission — tasks are a side effect
      }
    }

    return NextResponse.json(submission, { status: 201 })
  } catch (error) {
    console.error('POST /api/surveys error:', error)
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    )
  }
}
