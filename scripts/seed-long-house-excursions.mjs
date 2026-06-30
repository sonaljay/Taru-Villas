import postgres from 'postgres'
import fs from 'node:fs'

// Usage: node scripts/seed-long-house-excursions.mjs [path-to-csv]
const CSV_PATH =
  process.argv[2] ||
  '/Users/sonaljayawickrama/Downloads/NEW Taru Villas Experiences Content - Long House.csv'

const env = fs.readFileSync('.env.local', 'utf8')
const url = (env.match(/^POSTGRES_URL=(.*)$/m) || env.match(/^DATABASE_URL=(.*)$/m))[1]
  .replace(/^["']|["']$/g, '')
const sql = postgres(url, { prepare: false })

const PROPERTY_ID = '5351150a-080b-446b-a9d5-a2cb93109332' // The Long House

// Short, human-readable duration for the card's clock chip, keyed by Order.
// (The source sheet embeds timing inside the "Experience" prose; these are the
//  concise summaries surfaced on the card.)
const DURATIONS = {
  1: '≈1.5h per site',
  2: '2h or 4h',
  3: '≈1.5–2h',
  4: '15–30 min',
  5: '2h',
  6: '≈1h (10–12 min flight)',
  7: '≈2h total',
  8: '≈1h',
  9: '1h or 3h',
  10: 'Half or full day',
  11: 'Full day',
  12: '≈7h',
  13: '≈4h (half day)',
  14: '3–4h',
  15: '60 min',
  16: null,
  17: '3–4h',
  18: '2–3h',
  19: '1h',
  20: '≈2h',
}

// --- Minimal RFC4180 CSV parser (handles quoted fields with newlines) -------
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  row.push(field)
  rows.push(row)
  return rows
}

// Collapse trailing whitespace per line, drop runaway blank runs, trim ends.
function norm(v) {
  const out = (v ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out || null
}

// "Title line 1\nTitle line 2" -> "Title line 1: Title line 2"
function normTitle(v) {
  return (v ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(': ')
}

// Activity labels -> deduped array, split on newline or comma.
function parseTags(v) {
  const seen = new Set()
  const tags = []
  for (const raw of (v ?? '').split(/[\n,]/)) {
    const t = raw.trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      tags.push(t)
    }
  }
  return tags
}

// Locations cell -> [{ name, mapUrl }]. Handles "a) Name  <url>" lines and
// name/url split across separate lines (e.g. Meetiyagoda then its URL).
function parseLocations(v) {
  const urlRe = /(https?:\/\/\S+)/
  const out = []
  let pendingName = null
  for (const raw of (v ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(urlRe)
    if (m) {
      const url = m[1]
      let name = line.slice(0, m.index).replace(/^[a-z]\)\s*/i, '').trim()
      if (!name && pendingName) name = pendingName
      pendingName = null
      out.push({ name: name || url, mapUrl: url })
    } else {
      const name = line.replace(/^[a-z]\)\s*/i, '').trim()
      if (pendingName) out.push({ name: pendingName, mapUrl: null })
      pendingName = name
    }
  }
  if (pendingName) out.push({ name: pendingName, mapUrl: null })
  return out
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'))
  const records = []
  for (const r of rows) {
    const order = parseInt((r[0] ?? '').trim(), 10)
    if (!Number.isInteger(order) || order < 1) continue // skip header + NEXT section
    const title = normTitle(r[1])
    if (!title) continue
    records.push({
      sortOrder: order,
      title,
      description: norm(r[2]),
      experience: norm(r[3]),
      whatsIncluded: norm(r[4]),
      price: norm(r[5]),
      duration: DURATIONS[order] ?? null,
      tags: parseTags(r[6]),
      locations: parseLocations(r[7]),
    })
  }

  if (records.length === 0) throw new Error('No excursion rows parsed from CSV')

  // Clean reseed for this property.
  await sql`delete from excursions where property_id = ${PROPERTY_ID}`

  for (const rec of records) {
    await sql`
      insert into excursions
        (property_id, title, description, experience, whats_included,
         price, duration, tags, locations, sort_order, is_active)
      values
        (${PROPERTY_ID}, ${rec.title}, ${rec.description}, ${rec.experience},
         ${rec.whatsIncluded}, ${rec.price}, ${rec.duration}, ${rec.tags},
         ${sql.json(rec.locations)}, ${rec.sortOrder}, true)`
  }

  const summary = await sql`
    select sort_order, title, price,
           array_length(tags, 1) as tag_count,
           jsonb_array_length(locations) as loc_count
    from excursions
    where property_id = ${PROPERTY_ID}
    order by sort_order`
  console.log(`Inserted ${summary.length} excursions for The Long House:`)
  for (const s of summary) {
    console.log(
      `  ${String(s.sort_order).padStart(2)}. ${s.title}  [${s.tag_count ?? 0} tags, ${s.loc_count ?? 0} locations]`
    )
  }
  await sql.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
