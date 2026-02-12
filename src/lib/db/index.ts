import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Prefer POSTGRES_URL (transaction mode, port 6543) for serverless compatibility.
// Session mode (port 5432) exhausts pool_size with concurrent serverless instances.
const connectionString = (
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  ''
).trim()

const client = postgres(connectionString, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })
