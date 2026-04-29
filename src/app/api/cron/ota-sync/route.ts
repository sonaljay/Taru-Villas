import { NextResponse } from 'next/server'
import { syncProperty } from '@/lib/ota/sync'
import { getActiveSources } from '@/lib/db/queries/ota'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sources = await getActiveSources()
  const results = []
  for (const s of sources) {
    try {
      results.push(await syncProperty(s.propertyId))
    } catch (e) {
      results.push({
        propertyId: s.propertyId,
        fetched: 0,
        inserted: 0,
        synthesisStatus: 'error' as const,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return NextResponse.json({ ran: results.length, results })
}
