import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import postgres from 'postgres'
const url = process.env.LO_TEST_DATABASE_URL
if (!url) throw Error('Set LO_TEST_DATABASE_URL to disposable localhost:55447/taru_lo')
const parsed = new URL(url)
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.port !== '55447' || parsed.pathname !== '/taru_lo') throw Error('Disposable LO database only')
const scratch = path.resolve('.superpowers/sdd/2026-10-05-lo-oracle-foundation')
mkdirSync(scratch, { recursive: true })
const baseline = spawnSync('git', ['show', 'ca83f43:src/lib/db/schema.ts'], { encoding: 'utf8' })
if (baseline.status !== 0) throw Error('Cannot read pre-LO migration baseline')
const schemaPath = path.join(scratch, 'baseline-schema.ts')
writeFileSync(schemaPath, baseline.stdout)
const exported = spawnSync('npx', ['--no-install', 'drizzle-kit', 'export', '--dialect', 'postgresql', '--schema', schemaPath], { encoding: 'utf8' })
if (exported.status !== 0) throw Error(exported.stderr)
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
try {
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);')
  await sql.unsafe(exported.stdout)
  for (const migration of ['drizzle/0037_lo_oracle_reservations.sql', 'drizzle/0038_lo_guest_portal.sql']) {
    const text = readFileSync(migration, 'utf8')
    await sql.unsafe(text)
    await sql.unsafe(text)
  }
  await sql`INSERT INTO organizations(id, name, slug) VALUES ('00000000-0000-4000-8000-000000000011','LO Test','lo-test')`
  await sql`INSERT INTO properties(id,org_id,name,slug,code,oracle_hotel_id) VALUES ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','LO Fixture','lo-fixture','LO-FIXTURE','LO')`
} finally { await sql.end() }
const run = spawnSync('npx', ['--no-install', 'vitest', 'run', 'src/lib/oracle', 'src/lib/db/queries/guest-profiles.test.ts', ...(process.env.LO_TEST_PORTAL === 'true' ? ['src/lib/guest-portal'] : [])], {
  stdio: 'inherit', env: { ...process.env, LO_TEST_DATABASE_URL: url, POSTGRES_URL: url, DATABASE_URL: url },
})
process.exit(run.status ?? 1)
