import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const url = process.env.TASK_TEST_DATABASE_URL
if (!url)
  throw Error(
    'Set TASK_TEST_DATABASE_URL to the disposable localhost:55439/taru_tasks database.',
  )
const parsed = new URL(url)
if (
  parsed.hostname !== 'localhost' ||
  parsed.port !== '55439' ||
  parsed.pathname !== '/taru_tasks'
)
  throw Error('Refusing to reset a non-disposable database.')
const scratch = path.resolve(
  '.superpowers/sdd/2026-09-25-task-manager-redesign',
)
mkdirSync(scratch, { recursive: true })
let schema = readFileSync('src/lib/db/schema.ts', 'utf8').split(
  '// Task workflow schema.',
)[0]
const start = schema.indexOf('export const tasks ='),
  end = schema.indexOf('export const taskAssignees =', start)
let task = schema.slice(start, end)
for (const name of [
  'committeeId',
  'approval',
  'approvalCycle',
  'version',
  'pausedStatus',
  'archivedAt',
  'deadlineVersion',
])
  task = task.replace(new RegExp('^  ' + name + ':.*\\n', 'm'), '')
task = task.replace(
  "projectId: uuid('project_id').references",
  "projectId: uuid('project_id').notNull().references",
)
schema = schema.slice(0, start) + task + schema.slice(end)
writeFileSync(path.join(scratch, 'baseline-schema.ts'), schema)
const result = spawnSync(
  'npx',
  [
    '--no-install',
    'drizzle-kit',
    'export',
    '--dialect',
    'postgresql',
    '--schema',
    path.join(scratch, 'baseline-schema.ts'),
  ],
  { encoding: 'utf8' },
)
if (result.status !== 0) throw Error(result.stderr)
const baseline = path.join(scratch, 'baseline.sql')
writeFileSync(baseline, result.stdout)
const env = {
  ...process.env,
  POSTGRES_URL: url,
  DATABASE_URL: url,
  TASK_TEST_BASE_SCHEMA: baseline,
}
for (const file of [
  'workflow.integration.test.ts',
  'lifecycle.integration.test.ts',
  'delivery.integration.test.ts',
]) {
  const run = spawnSync('npm', ['test', '--', 'src/lib/tasks/' + file], {
    stdio: 'inherit',
    env,
  })
  if (run.status !== 0) process.exit(run.status ?? 1)
}
