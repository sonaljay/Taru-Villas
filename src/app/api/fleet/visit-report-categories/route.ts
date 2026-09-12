import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  createVisitReportObservationCategory,
  createVisitReportReason,
  getVisitReportTaxonomy,
  updateVisitReportObservationCategory,
  updateVisitReportReason,
} from '@/lib/db/queries/visit-report-categories'

const reasonFields = z.object({ name: z.string().trim().min(1).max(255), sortOrder: z.number().int().min(0).max(100000).optional() })
const categoryFields = z.object({ primaryReasonId: z.uuid(), name: z.string().trim().min(1).max(255), sortOrder: z.number().int().min(0).max(100000).optional() })
const createSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('reason'), ...reasonFields.shape }),
  z.object({ entity: z.literal('category'), ...categoryFields.shape }),
])
const updateSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('reason'), id: z.uuid(), name: z.string().trim().min(1).max(255).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }),
  z.object({ entity: z.literal('category'), id: z.uuid(), primaryReasonId: z.uuid().optional(), name: z.string().trim().min(1).max(255).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }),
])

async function requireAdmin() {
  const profile = await getProfile()
  if (!profile) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!profile.isActive) return { error: NextResponse.json({ error: 'Account is inactive' }, { status: 403 }) }
  if (profile.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { profile }
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error
    return NextResponse.json(await getVisitReportTaxonomy(auth.profile.orgId))
  } catch (error) {
    console.error('GET /api/fleet/visit-report-categories error:', error)
    return NextResponse.json({ error: 'Failed to fetch visit report categories' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const created = parsed.data.entity === 'reason'
      ? await createVisitReportReason(auth.profile.orgId, parsed.data)
      : await createVisitReportObservationCategory(auth.profile.orgId, parsed.data)
    if (!created) return NextResponse.json({ error: 'Choose a primary reason in your organization' }, { status: 400 })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/visit-report-categories error:', error)
    return NextResponse.json({ error: 'Failed to create visit report category' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error
    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const updated = parsed.data.entity === 'reason'
      ? await updateVisitReportReason(auth.profile.orgId, parsed.data.id, parsed.data)
      : await updateVisitReportObservationCategory(auth.profile.orgId, parsed.data.id, parsed.data)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/fleet/visit-report-categories error:', error)
    return NextResponse.json({ error: 'Failed to update visit report category' }, { status: 500 })
  }
}
