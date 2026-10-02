import postgres from 'postgres'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })

console.log('--- fleet_requests (all) ---')
console.log(await sql`select id, request_type, status, origin_kind, origin_property_id, origin_text,
                             start_date, end_date, created_at, updated_at from fleet_requests`)

console.log('--- dispatches ---')
console.log(await sql`select id, status, generated_by, start_date, end_date, created_at from dispatches`)

console.log('--- dispatch_stops ---')
console.log(await sql`select id, dispatch_id, request_id, property_id, label from dispatch_stops`)

console.log('--- distance grid size ---')
console.log(await sql`select count(*)::int as n from property_distances`)
await sql.end()
