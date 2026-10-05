import { describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
const seen = vi.hoisted(() => ({ sql: '', params: [] as unknown[] }))
vi.mock('@/lib/db', () => ({ db: drizzle(async (sql, params) => { seen.sql = sql; seen.params = params; return { rows: [] } }) }))
import { getOracleBookingsForProperty, toOracleBooking } from './guest-profiles'
import type { GuestProfile } from '../schema'
describe('Oracle canonical projection', () => {
  it('excludes bearer tokens and staff fields', () => {
    const row = { oracleReservationId: 'synthetic', arrivalDate: '2026-10-05', departureDate: '2026-10-07', stayState: 'reserved', token: 'secret', oracleError: 'internal', postedBy: 'staff' } as GuestProfile
    const booking = toOracleBooking(row)
    expect(booking.oracleReservationId).toBe('synthetic')
    expect(booking).not.toHaveProperty('token')
    expect(booking).not.toHaveProperty('oracleError')
    expect(booking).not.toHaveProperty('postedBy')
  })
  it('restricts reads to organization, property and published production records', async () => {
    expect(await getOracleBookingsForProperty('org-a', 'property-a')).toEqual([])
    expect(seen.params).toEqual(['org-a', 'property-a', 'production'])
    expect(seen.sql).toContain('"last_synced_run_id" is not null')
    expect(seen.sql).toContain('"org_id" = $1')
  })
})
