import { NextRequest, NextResponse } from 'next/server'
import {
  getAllPropertiesWithOrg,
  getSlotConfig,
  getReadingsSince,
  upsertReading,
} from '@/lib/db/queries/utilities'
import { computeElectricityBreakdown, type SlotRow } from '@/lib/utilities/calculations'
import {
  currentISTMinutes,
  currentISTDate,
  windowClosedToday,
  type Slot,
} from '@/lib/utilities/slot-windows'

export const dynamic = 'force-dynamic'

const SLOTS: Slot[] = ['morning', 'evening', 'night']

function bearerOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  const nowMin = currentISTMinutes()
  const today = currentISTDate()
  // Trailing window: 31 days back so each day has its predecessor for off-peak.
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - 31)
  const sinceDate = since.toISOString().split('T')[0]

  const properties = await getAllPropertiesWithOrg()
  let filled = 0
  const details: { propertyId: string; slot: Slot; value: number | null }[] = []

  for (const prop of properties) {
    const slotTimes = await getSlotConfig(prop.orgId)
    const closedSlots = SLOTS.filter((s) => windowClosedToday(s, nowMin, slotTimes))
    if (closedSlots.length === 0) continue

    const readings = await getReadingsSince(prop.id, sinceDate)
    const byDate = new Map(readings.map((r) => [r.readingDate, r]))
    const todayRow = byDate.get(today)

    // 30-day bucket averages, excluding any day with an autofilled slot.
    const slotRows: SlotRow[] = readings.map((r) => ({
      date: r.readingDate,
      morning: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
      night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
    }))
    const statusByDate = new Map(
      readings.map((r) => [r.readingDate, [r.morningStatus, r.eveningStatus, r.nightStatus]])
    )
    const breakdown = computeElectricityBreakdown(slotRows)
    const avg = (pick: (b: (typeof breakdown)[number]) => number | null): number | null => {
      const vals: number[] = []
      for (const b of breakdown) {
        if (b.date === today) continue
        const statuses = statusByDate.get(b.date) ?? []
        if (statuses.includes('autofilled')) continue // don't average synthesized days
        const v = pick(b)
        if (v !== null) vals.push(v)
      }
      return vals.length > 0 ? vals.reduce((s, x) => s + x, 0) / vals.length : null
    }
    const avgDay = avg((b) => b.day)
    const avgPeak = avg((b) => b.peak)
    const avgOffPeak = avg((b) => b.offPeak)

    // Yesterday (IST) for the morning predecessor.
    const yDate = new Date(`${today}T00:00:00Z`)
    yDate.setUTCDate(yDate.getUTCDate() - 1)
    const yesterday = byDate.get(yDate.toISOString().split('T')[0])

    for (const slot of closedSlots) {
      const statuses = statusByDate.get(today) ?? [null, null, null]
      const idx = slot === 'morning' ? 0 : slot === 'evening' ? 1 : 2
      const existing = idx === 0 ? todayRow?.readingValue : idx === 1 ? todayRow?.eveningReading : todayRow?.nightReading
      if (existing !== null && existing !== undefined) continue // already entered
      if (statuses[idx] !== null) continue // already processed (autofilled/edited)

      // Predecessor reading + that slot's bucket average.
      let predecessor: number | null = null
      let bucketAvg: number | null = null
      if (slot === 'morning') {
        predecessor = yesterday?.nightReading != null ? parseFloat(yesterday.nightReading) : null
        bucketAvg = avgOffPeak
      } else if (slot === 'evening') {
        predecessor = todayRow?.readingValue != null ? parseFloat(todayRow.readingValue) : null
        bucketAvg = avgDay
      } else {
        predecessor = todayRow?.eveningReading != null ? parseFloat(todayRow.eveningReading) : null
        bucketAvg = avgPeak
      }

      const value =
        predecessor !== null && bucketAvg !== null ? predecessor + bucketAvg : null

      await upsertReading({
        propertyId: prop.id,
        utilityType: 'electricity',
        readingDate: today,
        readingValue: value !== null ? String(value) : null,
        slot,
        status: 'autofilled',
        recordedBy: null,
      })
      filled++
      details.push({ propertyId: prop.id, slot, value })
    }
  }

  return { filled, details }
}

export async function POST(request: NextRequest) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await run()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('POST /api/cron/electricity-autofill error:', error)
    return NextResponse.json({ error: 'Auto-fill failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
