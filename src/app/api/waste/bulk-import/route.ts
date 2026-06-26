import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getExistingWasteDates,
  bulkUpsertWasteLogs,
  type BulkWasteRow,
} from '@/lib/db/queries/waste'
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
  dryRun: z.boolean(),
  rows: z.array(z.record(z.string(), z.string())).max(2000),
})

const KG_COLUMNS = ['paper_kg', 'glass_kg', 'plastic_kg', 'food_kg', 'metal_kg', 'electronic_kg'] as const

/** Parse an optional non-negative kg cell; blank defaults to '0'. */
function parseKg(raw: string): { value: string; error?: string } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: '0' }
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: '0', error: `"${s}" is not a number` }
  if (n < 0) return { value: '0', error: `"${s}" must be ≥ 0` }
  return { value: s }
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
    const { propertyId, dryRun, rows } = parsed.data

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const today = currentISTDate()
    const errors: { row: number; message: string }[] = []
    const valid: BulkWasteRow[] = []
    const seen = new Set<string>()

    rows.forEach((row, i) => {
      const lineNo = i + 2
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
      seen.add(date)

      const parsedKg = KG_COLUMNS.map((c) => parseKg(row[c] ?? ''))
      const kgError = parsedKg.find((p) => p.error)?.error
      if (kgError) {
        errors.push({ row: lineNo, message: kgError })
        return
      }

      const note = (row['note'] ?? '').trim()
      if (note.length > 500) {
        errors.push({ row: lineNo, message: 'Note exceeds 500 characters' })
        return
      }

      valid.push({
        logDate: date,
        paperKg: parsedKg[0].value,
        glassKg: parsedKg[1].value,
        plasticKg: parsedKg[2].value,
        foodKg: parsedKg[3].value,
        metalKg: parsedKg[4].value,
        electronicKg: parsedKg[5].value,
        note: note === '' ? null : note,
      })
    })

    const existing = await getExistingWasteDates(propertyId, valid.map((v) => v.logDate))
    const overwriteCount = valid.filter((v) => existing.has(v.logDate)).length
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

    await bulkUpsertWasteLogs(propertyId, valid, profile.id)
    return NextResponse.json({ ...preview, committed: true, imported: valid.length })
  } catch (error) {
    console.error('POST /api/waste/bulk-import error:', error)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
