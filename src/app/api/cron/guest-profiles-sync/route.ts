import { enqueueGuestEmails } from '@/lib/guest-portal/email-worker'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { advanceLoSync } from '@/lib/oracle/sync'
import { cleanLoStaging } from '@/lib/db/queries/oracle-sync'
import { isCronAuthorized } from '@/lib/oracle/cron-auth'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if ((process.env.ORACLE_OHIP_ENVIRONMENT ?? 'production') !== 'production') return NextResponse.json({ error: 'Production Oracle configuration required' }, { status: 503 })
    const rows = await db.select({ orgId: properties.orgId, propertyId: properties.id }).from(properties).where(and(eq(properties.oracleHotelId, 'LO'), eq(properties.isActive, true)))
    const today = new Date(), started = Date.now()
    const fromDate = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })
    const [year, month] = fromDate.split('-').map(Number)
    const toDate = new Date(Date.UTC(year, month + 11, 0)).toISOString().slice(0, 10)
    const details = []
    for (const scope of rows) {
      if (Date.now() - started > 30_000) break
      details.push(await advanceLoSync(scope, { fromDate, toDate, budgetMs: Math.max(21000, 45000 - (Date.now() - started)) }))
    }
    if (details.some(result => result.state === 'complete')) await enqueueGuestEmails(new Date()).catch(() => undefined)
    await cleanLoStaging()
    return NextResponse.json({ properties: rows.length, details }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Sync failed' }, { status: 500 }) }
}
export const GET = POST
