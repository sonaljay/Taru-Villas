import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import { getOrCreateCompletion } from '@/lib/db/queries/sops'

// ---------------------------------------------------------------------------
// POST /api/sops/completions — Get or create a completion for assignment+date
// ---------------------------------------------------------------------------

const createCompletionSchema = z.object({
  assignmentId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

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
    const parsed = createCompletionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const completion = await getOrCreateCompletion(
      parsed.data.assignmentId,
      parsed.data.dueDate
    )

    return NextResponse.json(completion, { status: 201 })
  } catch (error) {
    console.error('POST /api/sops/completions error:', error)
    return NextResponse.json(
      { error: 'Failed to create completion' },
      { status: 500 }
    )
  }
}
