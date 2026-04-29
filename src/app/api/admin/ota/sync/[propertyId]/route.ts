import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/guards'
import { syncProperty } from '@/lib/ota/sync'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  await requireRole(['admin'])
  const { propertyId } = await params
  const result = await syncProperty(propertyId)
  return NextResponse.json(result)
}
