import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getProperties, getPropertiesForUser, createProperty } from '@/lib/db/queries/properties'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createPropertySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Code is required').max(50),
  slug: z.string().min(1, 'Slug is required').max(255),
  location: z.string().max(500).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// GET /api/properties
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const props =
      profile.role === 'admin'
        ? await getProperties(profile.orgId)
        : await getPropertiesForUser(profile.id)

    return NextResponse.json(props)
  } catch (error) {
    console.error('GET /api/properties error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch properties' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/properties
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
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createPropertySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const property = await createProperty({
      ...parsed.data,
      orgId: profile.orgId,
    })

    return NextResponse.json(property, { status: 201 })
  } catch (error) {
    console.error('POST /api/properties error:', error)
    return NextResponse.json(
      { error: 'Failed to create property' },
      { status: 500 }
    )
  }
}
