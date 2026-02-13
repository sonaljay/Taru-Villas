import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  getOrCreateGuestLink,
  getGuestLinksForOrg,
} from '@/lib/db/queries/guest-links'

const createLinkSchema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
})

// POST /api/admin/guest-links — create or retrieve a guest link
export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createLinkSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const link = await getOrCreateGuestLink(
      parsed.data.templateId,
      parsed.data.propertyId,
      profile.id
    )

    const origin = request.headers.get('origin') || request.nextUrl.origin
    const url = `${origin}/g/${link.token}`

    return NextResponse.json({
      id: link.id,
      token: link.token,
      link: url,
      isActive: link.isActive,
    })
  } catch (error) {
    console.error('POST /api/admin/guest-links error:', error)
    return NextResponse.json(
      { error: 'Failed to create guest link' },
      { status: 500 }
    )
  }
}

// GET /api/admin/guest-links — list all guest links for org
export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const links = await getGuestLinksForOrg(profile.orgId)
    return NextResponse.json(links)
  } catch (error) {
    console.error('GET /api/admin/guest-links error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch guest links' },
      { status: 500 }
    )
  }
}
