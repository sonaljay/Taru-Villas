import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  getCompletionWithItems,
  upsertItemCompletion,
} from '@/lib/db/queries/sops'

type Params = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/sops/completions/[id] — Get completion with item completions
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { id } = await params
    const completion = await getCompletionWithItems(id)
    if (!completion) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(completion)
  } catch (error) {
    console.error('GET /api/sops/completions/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch completion' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/sops/completions/[id] — Check/uncheck an item
// ---------------------------------------------------------------------------

const checkItemSchema = z.object({
  itemId: z.string().uuid(),
  isChecked: z.boolean(),
  note: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = checkItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const itemCompletion = await upsertItemCompletion(
      id,
      parsed.data.itemId,
      parsed.data.isChecked,
      parsed.data.note
    )

    // Return updated completion with all items
    const completion = await getCompletionWithItems(id)

    return NextResponse.json({ itemCompletion, completion })
  } catch (error) {
    console.error('PATCH /api/sops/completions/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    )
  }
}
