import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getLoBookingReport } from '@/lib/db/queries/sales-marketing'
import { OracleAccessError } from '@/lib/oracle/access'
import { ReportRangeError } from '@/lib/sales-marketing/room-nights'
export const dynamic = 'force-dynamic'
const query = z.object({ propertyId: z.string().uuid(), fromDate: z.string(), toDateExclusive: z.string() })
export async function GET(request: NextRequest) {
  try {
    const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Property and stay-date range required' }, { status: 400 })
    const result = await getLoBookingReport(parsed.data.propertyId, parsed.data)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof OracleAccessError || error instanceof ReportRangeError ? error.message : 'Booking report unavailable' }, { status: error instanceof OracleAccessError ? error.status : error instanceof ReportRangeError ? 400 : 500 })
  }
}
