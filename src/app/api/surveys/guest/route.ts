import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getGuestLinkByToken } from '@/lib/db/queries/guest-links'
import { getTemplateById, createSubmission } from '@/lib/db/queries/surveys'

const responseSchema = z.object({
  questionId: z.string().uuid('Invalid question ID'),
  score: z.number().int().min(0).max(10),
  note: z.string().max(1000).optional(),
})

const guestSubmissionSchema = z.object({
  token: z.string().min(1),
  guestName: z.string().max(200).optional(),
  guestEmail: z.string().email().max(320).optional().or(z.literal('')),
  responses: z.array(responseSchema).min(1, 'At least one response is required'),
})

// POST /api/surveys/guest — public guest submission (no auth)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = guestSubmissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { token, guestName, guestEmail, responses } = parsed.data

    // Look up the guest link
    const link = await getGuestLinkByToken(token)
    if (!link) {
      return NextResponse.json(
        { error: 'Survey link not found' },
        { status: 404 }
      )
    }
    if (!link.isActive) {
      return NextResponse.json(
        { error: 'This survey link is no longer active' },
        { status: 410 }
      )
    }
    if (!link.templateIsActive) {
      return NextResponse.json(
        { error: 'This survey template is no longer active' },
        { status: 410 }
      )
    }
    if (link.templateSurveyType !== 'guest') {
      return NextResponse.json(
        { error: 'This template is not configured for guest surveys' },
        { status: 400 }
      )
    }

    // Validate all required questions are answered
    const template = await getTemplateById(link.templateId)
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    const allQuestions = template.categories.flatMap((c) =>
      c.subcategories.flatMap((s) => s.questions)
    )
    const requiredIds = new Set(
      allQuestions.filter((q) => q.isRequired).map((q) => q.id)
    )
    const answeredIds = new Set(responses.map((r) => r.questionId))

    for (const reqId of requiredIds) {
      if (!answeredIds.has(reqId)) {
        return NextResponse.json(
          { error: 'Not all required questions have been answered' },
          { status: 400 }
        )
      }
    }

    // Create the submission
    const today = new Date().toISOString().slice(0, 10)
    const submission = await createSubmission({
      submission: {
        templateId: link.templateId,
        propertyId: link.propertyId,
        submittedBy: null,
        visitDate: today,
        notes: null,
        status: 'submitted',
        guestName: guestName || null,
        guestEmail: guestEmail || null,
        guestLinkId: link.id,
        submittedAt: new Date(),
      },
      responses: responses.map((r) => ({
        questionId: r.questionId,
        score: r.score,
        note: r.note ?? null,
      })),
    })

    return NextResponse.json({ id: submission.id }, { status: 201 })
  } catch (error) {
    console.error('POST /api/surveys/guest error:', error)
    return NextResponse.json(
      { error: 'Failed to submit survey' },
      { status: 500 }
    )
  }
}
