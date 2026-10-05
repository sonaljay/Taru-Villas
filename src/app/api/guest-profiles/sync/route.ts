import { enqueueGuestEmails } from '@/lib/guest-portal/email-worker'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { requireLoPropertyAccess, OracleAccessError } from '@/lib/oracle/access'
import { validOracleDate } from '@/lib/oracle/reservations'
import { advanceLoSync, getLoSyncStatus, OracleProtocolError } from '@/lib/oracle/sync'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
const bodySchema = z.object({ propertyId: z.string().uuid(), fromDate: z.string().refine(validOracleDate), toDate: z.string().refine(validOracleDate) })
export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.safeParse(await request.json())
    if (!body.success) return NextResponse.json({ error: 'Invalid sync request' }, { status: 400 })
    const scope = await requireLoPropertyAccess(body.data.propertyId)
    const result = await advanceLoSync(scope, { fromDate: body.data.fromDate, toDate: body.data.toDate, budgetMs: 45000 })
    if (result.state === 'complete') await enqueueGuestEmails(new Date()).catch(() => undefined)
    return NextResponse.json(result, { status: result.state === 'failed' ? 502 : 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof OracleAccessError || error instanceof OracleProtocolError ? error.message : 'Sync failed' }, { status: error instanceof OracleAccessError ? error.status : error instanceof OracleProtocolError ? 400 : 500 })
  }
}
export async function GET(request: NextRequest) {
  try {
    const propertyId = z.string().uuid().safeParse(request.nextUrl.searchParams.get('propertyId'))
    if (!propertyId.success) return NextResponse.json({ error: 'Property required' }, { status: 400 })
    const scope = await requireLoPropertyAccess(propertyId.data)
    return NextResponse.json(await getLoSyncStatus(scope.orgId, scope.propertyId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return NextResponse.json({ error: error instanceof OracleAccessError ? error.message : 'Status unavailable' }, { status: error instanceof OracleAccessError ? error.status : 500 }) }
}
