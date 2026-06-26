// src/lib/utilities/csv.ts
// Pure helpers for bulk CSV import — no DB, no React, no Node-only APIs.

export type ImportType = 'electricity' | 'water' | 'wastage'

export const TEMPLATE_HEADERS: Record<ImportType, string[]> = {
  electricity: ['date', 'morning', 'evening', 'night', 'guest_count', 'staff_count', 'note'],
  water: ['date', 'reading', 'guest_count', 'staff_count', 'note'],
  wastage: ['date', 'paper_kg', 'glass_kg', 'plastic_kg', 'food_kg', 'metal_kg', 'electronic_kg', 'note'],
}

const TEMPLATE_EXAMPLE: Record<ImportType, string[]> = {
  electricity: ['2026-01-15', '12450.50', '12480.00', '12510.25', '8', '4', ''],
  water: ['2026-01-15', '8234.00', '8', '4', ''],
  wastage: ['2026-01-15', '2.5', '1.0', '3.2', '5.5', '0.8', '0', ''],
}

/** Build template CSV text (header + one example row) for a given import type. */
export function buildTemplate(type: ImportType): string {
  const header = TEMPLATE_HEADERS[type].join(',')
  const example = TEMPLATE_EXAMPLE[type].join(',')
  return `${header}\n${example}\n`
}

/** Parse a single CSV line into fields, honoring double-quoted fields with embedded commas/quotes. */
function parseLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields.map((f) => f.trim())
}

/**
 * Parse CSV text into a header list and an array of row objects keyed by header.
 * Strips a UTF-8 BOM, normalizes CRLF, and skips fully-blank lines.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lines = clean.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = fields[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

/** True only for a real YYYY-MM-DD calendar date (e.g. rejects 2026-02-30). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
