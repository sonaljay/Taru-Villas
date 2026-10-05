import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { getOracleBookingsForProperty } from '@/lib/db/queries/guest-profiles'
const url = process.env.LO_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('isolated LO snapshot schema', () => {
  let sql: ReturnType<typeof postgres>
  beforeAll(() => {
    if (!url || !/^postgresql:\/\/[^/]+@(localhost|127\.0\.0\.1):55447\/taru_lo$/.test(url)) throw Error('Disposable LO database only')
    sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
  })
  const org = '00000000-0000-4000-8000-000000000011', property = '00000000-0000-4000-8000-000000000012'
  afterAll(async () => { await sql`delete from guest_profiles where oracle_reservation_id like 'schema-%'`; await sql`delete from oracle_sync_runs where phase='schema-fixture'`; await sql.end() })
  it('has production-only, inventory and count constraints after repeatable migration', async () => {
    const [run] = await sql`insert into oracle_sync_runs(org_id,property_id,from_date,to_date,state,phase) values(${org},${property},'2026-10-05','2027-09-30','complete','schema-fixture') returning id`
    await expect(sql`insert into guest_profiles(org_id,property_id,oracle_reservation_id,token,room_quantity) values(${org},${property},'schema-invalid','invalid',0)`).rejects.toMatchObject({ code: '23514' })
    await expect(sql`insert into oracle_sync_runs(org_id,property_id,from_date,to_date,environment) values(${org},${property},'2026-10-05','2027-09-30','uat')`).rejects.toMatchObject({ code: '23514' })
    await sql`insert into guest_profiles(org_id,property_id,oracle_reservation_id,token,arrival_date,departure_date,room_quantity,stay_state,last_synced_run_id,inventory_disposition) values(${org},${property},'schema-synthetic','private','2026-10-05','2026-10-07',2,'reserved',${run.id},'count')`
    const rows = await getOracleBookingsForProperty(org, property)
    expect(rows.find(r => r.oracleReservationId === 'schema-synthetic')).toMatchObject({ roomQuantity: 2, stayState: 'reserved', arrivalDate: '2026-10-05' })
    expect(rows[0]).not.toHaveProperty('token')
    expect(await getOracleBookingsForProperty('00000000-0000-4000-8000-000000000099', property)).toEqual([])
    const columns = await sql`select column_name from information_schema.columns where table_name='guest_profiles' and column_name in ('room_quantity','stay_state','last_synced_run_id','guest_phone')`
    expect(columns).toHaveLength(4)
  })
})
