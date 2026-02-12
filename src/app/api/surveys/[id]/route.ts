import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getSubmissionById,
  updateSubmission,
  submitSubmission,
} from '@/lib/db/queries/surveys'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  score: z.number().int().min(0).max(10),
  note: z.string().max(1000).optional(),
})

const updateSubmissionSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Visit date must be YYYY-MM-DD format').optional(),
  notes: z.string().max(2000).nullable().optional(),
  responses: z.array(responseSchema).min(1).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/surveys/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const submission = await getSubmissionById(id)
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Check property access
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(submission.propertyId)) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this submission' },
        { status: 403 }
      )
    }

    return NextResponse.json(submission)
  } catch (error) {
    console.error('GET /api/surveys/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submission' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/surveys/[id] — Update a draft submission
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const existing = await getSubmissionById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Only the submitter can edit their own draft
    if (existing.submittedBy !== profile.id) {
      return NextResponse.json(
        { error: 'Forbidden: you can only edit your own submissions' },
        { status: 403 }
      )
    }

    // Can only edit drafts
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Cannot edit a submission that has already been submitted' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parsed = updateSubmissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { visitDate, notes, responses } = parsed.data

    const updated = await updateSubmission(id, {
      submission: {
        ...(visitDate !== undefined && { visitDate }),
        ...(notes !== undefined && { notes }),
      },
      responses: responses
        ? responses.map((r) => ({
            questionId: r.questionId,
            score: r.score,
            note: r.note ?? null,
          }))
        : undefined,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/surveys/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update submission' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/surveys/[id] — Submit a draft (action=submit)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action !== 'submit') {
      return NextResponse.json(
        { error: 'Invalid action. Use ?action=submit' },
        { status: 400 }
      )
    }

    const existing = await getSubmissionById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Only the submitter can submit their own draft
    if (existing.submittedBy !== profile.id) {
      return NextResponse.json(
        { error: 'Forbidden: you can only submit your own surveys' },
        { status: 403 }
      )
    }

    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'This submission has already been submitted' },
        { status: 400 }
      )
    }

    // Ensure there are responses before submitting
    if (!existing.responses || existing.responses.length === 0) {
      return NextResponse.json(
        { error: 'Cannot submit a survey with no responses' },
        { status: 400 }
      )
    }

    const submitted = await submitSubmission(id)
    if (!submitted) {
      return NextResponse.json(
        { error: 'Failed to submit survey' },
        { status: 500 }
      )
    }

    return NextResponse.json(submitted)
  } catch (error) {
    console.error('POST /api/surveys/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to submit survey' },
      { status: 500 }
    )
  }
}
