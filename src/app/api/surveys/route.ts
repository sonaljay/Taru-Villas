import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getSubmissions,
  createSubmission,
  type SubmissionFilters,
} from '@/lib/db/queries/surveys'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  score: z.number().int().min(0).max(10),
  note: z.string().max(1000).optional(),
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

    // If a specific property is requested, check access
    if (propertyId) {
      const userProps = await getUserProperties(profile.id, profile.role)
      if (userProps && !userProps.includes(propertyId)) {
        return NextResponse.json(
          { error: 'Forbidden: no access to this property' },
          { status: 403 }
        )
      }
    }

    // Build filters
    const filters: SubmissionFilters = {}
    if (propertyId) filters.propertyId = propertyId
    if (status) filters.status = status

    // For non-admin users without a specific property filter,
    // restrict to their own submissions
    if (profile.role !== 'admin' && !propertyId) {
      filters.userId = profile.id
    }

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

    // Check property access
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(propertyId)) {
      return NextResponse.json(
        { error: 'Forbidden: no access to this property' },
        { status: 403 }
      )
    }

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
      })),
    })

    return NextResponse.json(submission, { status: 201 })
  } catch (error) {
    console.error('POST /api/surveys error:', error)
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    )
  }
}
