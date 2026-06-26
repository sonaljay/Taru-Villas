import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/lib/db/schema'
import { isNotNull, eq, and } from 'drizzle-orm'
import { syncPropertyArrivals, refreshPropertyStatuses } from '@/lib/oracle/sync'

export const dynamic = 'force-dynamic'

function bearerOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function run() {
  const rows = await db
    .select()
    .from(properties)
    .where(and(isNotNull(properties.oracleHotelId), eq(properties.isActive, true)))

  const today = new Date()
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const from = isoDate(today)
  const to = isoDate(in30)

  const details: Array<Record<string, unknown>> = []
  for (const p of rows) {
    if (!p.oracleHotelId) continue
    const pull = await syncPropertyArrivals(p.orgId, p.id, p.oracleHotelId, from, to)
    const refresh = await refreshPropertyStatuses(p.id, p.oracleHotelId)
    details.push({ propertyId: p.id, ...pull, ...refresh })
  }
  return { properties: rows.length, details }
}

export async function POST(request: NextRequest) {
  if (!bearerOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await run()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('POST /api/cron/guest-profiles-sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
