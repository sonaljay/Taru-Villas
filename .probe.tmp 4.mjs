import postgres from 'postgres'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })
const [admin] = await sql`select id, org_id from profiles where role = 'admin' limit 1`
const [row] = await sql`
  insert into fleet_requests (org_id, request_type, requested_by, destination_text, start_date, end_date, pax_count)
  values (${admin.org_id}, 'standalone', ${admin.id}, 'Airport', '2026-08-05', '2026-08-06', 1)
  returning id`
console.log('SEEDED', row.id)
await sql.end()
