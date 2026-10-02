import postgres from 'postgres'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })
console.log(await sql`select origin_kind, origin_property_id, origin_text from fleet_requests limit 5`)
await sql.end()
