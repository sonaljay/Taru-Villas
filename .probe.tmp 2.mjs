import postgres from 'postgres'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })

const [admin] = await sql`select id, org_id from profiles where email = 'harsha@taruvillas.com'`
const [prop] = await sql`select id from properties where is_active = true limit 1`

try {
  await sql.begin(async (tx) => {
    const [row] = await tx`
      insert into fleet_requests (org_id, request_type, requested_by, target_property_id, start_date, end_date, pax_count, cargo_required)
      values (${admin.org_id}, 'visit', ${admin.id}, ${prop.id}, '2026-08-05', '2026-08-06', 1, false)
      returning id, request_type, status, start_date, end_date, pax_count`
    console.log('INSERT OK (inside transaction):', row)
    throw new Error('ROLLBACK_ON_PURPOSE')
  })
} catch (e) {
  if (e.message !== 'ROLLBACK_ON_PURPOSE') throw e
  console.log('Transaction rolled back — no data written.')
}

const [{ n }] = await sql`select count(*)::int as n from fleet_requests`
console.log('fleet_requests row count after rollback:', n)
await sql.end()
