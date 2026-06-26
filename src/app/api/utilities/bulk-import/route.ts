// src/app/api/utilities/bulk-import/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getExistingReadingDates,
  bulkUpsertReadings,
  type BulkReadingRow,
} from '@/lib/db/queries/utilities'
import { isValidIsoDate } from '@/lib/utilities/csv'
import { currentISTDate } from '@/lib/utilities/slot-windows'

async function checkPropertyAccess(
  profile: { id: string; role: string },
  propertyId: string
) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(
    profile.id,
    profile.role as 'admin' | 'property_manager' | 'staff'
  )
  if (!userProps) return true
  return userProps.includes(propertyId)
}

const bodySchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  dryRun: z.boolean(),
  rows: z.array(z.record(z.string(), z.string())).max(2000),
})

/** Parse an optional non-negative numeric cell. Returns { value } or { error }. */
function parseValue(raw: string): { value: string | null; error?: string } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: null }
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: null, error: `"${s}" is not a number` }
  if (n < 0) return { value: null, error: `"${s}" must be ≥ 0` }
  return { value: s }
}

/** Parse an optional non-negative integer count. Returns { value } or { error }. */
function parseCount(raw: string): { value: number | null; error?: string } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: null }
  const n = Number(s)
  if (!Number.isInteger(n) || n < 0) return { value: null, error: `"${s}" must be a whole number ≥ 0` }
  return { value: n }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { propertyId, utilityType, dryRun, rows } = parsed.data

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const today = currentISTDate()
    const errors: { row: number; message: string }[] = []
    const valid: BulkReadingRow[] = []
    const seen = new Set<string>()

    rows.forEach((row, i) => {
      const lineNo = i + 2 // +1 for header, +1 for 1-based
      const date = (row['date'] ?? '').trim()

      if (!isValidIsoDate(date)) {
        errors.push({ row: lineNo, message: `Invalid date "${date}" (expected YYYY-MM-DD)` })
        return
      }
      if (date > today) {
        errors.push({ row: lineNo, message: `Date ${date} is in the future` })
        return
      }
      if (seen.has(date)) {
        errors.push({ row: lineNo, message: `Duplicate date ${date} in file` })
        return
      }

      const morning = parseValue(row['morning'] ?? row['reading'] ?? '')
      const evening = utilityType === 'electricity' ? parseValue(row['evening'] ?? '') : { value: null }
      const night = utilityType === 'electricity' ? parseValue(row['night'] ?? '') : { value: null }
      const guest = parseCount(row['guest_count'] ?? '')
      const staff = parseCount(row['staff_count'] ?? '')

      const cellError = morning.error || evening.error || night.error || guest.error || staff.error
      if (cellError) {
        errors.push({ row: lineNo, message: cellError })
        return
      }
      if (morning.value === null && evening.value === null && night.value === null) {
        errors.push({ row: lineNo, message: 'Row has no reading value' })
        return
      }

      const note = (row['note'] ?? '').trim()
      if (note.length > 500) {
        errors.push({ row: lineNo, message: 'Note exceeds 500 characters' })
        return
      }

      seen.add(date)
      valid.push({
        readingDate: date,
        morning: morning.value,
        evening: evening.value,
        night: night.value,
        guestCount: guest.value,
        staffCount: staff.value,
        note: note === '' ? null : note,
      })
    })

    const existing = await getExistingReadingDates(
      propertyId,
      utilityType,
      valid.map((v) => v.readingDate)
    )
    const overwriteCount = valid.filter((v) => existing.has(v.readingDate)).length
    const newCount = valid.length - overwriteCount

    const preview = {
      total: rows.length,
      newCount,
      overwriteCount,
      errorCount: errors.length,
      errors,
      committed: false,
      imported: 0,
    }

    if (dryRun) return NextResponse.json(preview)

    if (errors.length > 0) {
      return NextResponse.json(
        { ...preview, error: 'Fix all errors before importing' },
        { status: 400 }
      )
    }

    await bulkUpsertReadings(propertyId, utilityType, valid, profile.id)
    return NextResponse.json({ ...preview, committed: true, imported: valid.length })
  } catch (error) {
    console.error('POST /api/utilities/bulk-import error:', error)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
