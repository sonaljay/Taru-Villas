import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./client', () => ({ listReservationPage: vi.fn(), readReservation: vi.fn() }))
vi.mock('@/lib/db/queries/oracle-sync', () => ({ acquireLoRun: vi.fn(), stageLoPage: vi.fn(), saveLoCursor: vi.fn(), advanceLoPhase: vi.fn(), getLoDetailIds: vi.fn(), publishLoSync: vi.fn(), failLoSync: vi.fn(), releaseLoLease: vi.fn(), OracleLeaseError: class extends Error {} }))
import { listReservationPage, readReservation } from './client'
import * as persistence from '@/lib/db/queries/oracle-sync'
import { advanceLoSync } from './sync'
import type { OracleBooking } from './types'
const booking: OracleBooking = { oracleReservationId: 'synthetic', confirmationNumber: null, guestName: 'Test', guestEmail: null, guestPhone: null, arrivalDate: '2026-09-30', departureDate: '2026-10-07', roomType: 'DLX', roomNumber: null, roomQuantity: 1, adultCount: 2, childCount: 0, reservationStatus: 'InHouse', stayState: 'in_house', channelCode: null, sourceCode: null, marketCode: null, isRoomReservation: true, isPseudoRoom: false, inventoryGroupId: null, inventoryDisposition: 'count' }
const scope = { orgId: 'org-a', propertyId: 'property-a' }
const options = { fromDate: '2026-10-05', toDate: '2026-11-30', budgetMs: 45000 }
const run = (override = {}) => ({ id: 'run', ...scope, phase: 'arrivals:0', offset: 0, state: 'running', leaseOwner: 'worker', detailIds: [], lastPageFingerprint: null, fromDate: options.fromDate, toDate: options.toDate, acquired: true, ...override })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ORACLE_OHIP_ENVIRONMENT', 'production')
  vi.mocked(persistence.acquireLoRun).mockResolvedValue(run() as never)
  vi.mocked(persistence.stageLoPage).mockResolvedValue(1 as never)
  vi.mocked(persistence.getLoDetailIds).mockResolvedValue([])
  vi.mocked(listReservationPage).mockResolvedValue({ ok: true, data: { bookings: [], offset: 0, hasMore: false, totalResults: 0 } })
})
describe('complete resumable Oracle sync', () => {
  it('does not publish a partial snapshot when the next page fails', async () => {
    vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: true, data: { bookings: [booking], offset: 0, hasMore: true, totalResults: 2 } }).mockResolvedValueOnce({ ok: false, status: 502, error: 'OHIP unavailable' })
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'failed' })
    expect(persistence.publishLoSync).not.toHaveBeenCalled()
  })
  it('fetches all monthly pages and includes earlier-arriving in-house guests before publishing', async () => {
    vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: true, data: { bookings: [booking], offset: 0, hasMore: true, totalResults: 2 } }).mockResolvedValueOnce({ ok: true, data: { bookings: [{ ...booking, oracleReservationId: 'second' }], offset: 1, hasMore: false, totalResults: 2 } })
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'complete' })
    expect(listReservationPage).toHaveBeenCalledWith('LO', { fromDate: '2026-10-05', toDate: '2026-10-31', offset: 0, limit: 100 })
    expect(listReservationPage).toHaveBeenCalledWith('LO', { fromDate: '2026-11-01', toDate: '2026-11-30', offset: 0, limit: 100 })
    expect(listReservationPage).toHaveBeenCalledWith('LO', { searchType: 'InHouse', offset: 0, limit: 100 })
    expect(persistence.publishLoSync).toHaveBeenCalledWith('run', 'worker')
  })
  it('resumes the persisted window/offset instead of starting again', async () => {
    vi.mocked(persistence.acquireLoRun).mockResolvedValue(run({ phase: 'arrivals:1', offset: 100 }) as never)
    vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: true, data: { bookings: [], offset: 100, hasMore: false, totalResults: 100 } })
    await advanceLoSync(scope, options)
    expect(vi.mocked(listReservationPage).mock.calls[0][1]).toMatchObject({ fromDate: '2026-11-01', offset: 100 })
  })
  it('fails pagination that makes no progress', async () => {
    vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: true, data: { bookings: [], offset: 0, hasMore: true, totalResults: 100 } })
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'failed' })
    expect(persistence.publishLoSync).not.toHaveBeenCalled()
  })
  it('stops repeated pages with advancing offsets rather than looping', async () => {
    vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: true, data: { bookings: [booking], offset: 0, hasMore: true, totalResults: 4 } }).mockResolvedValueOnce({ ok: true, data: { bookings: [booking], offset: 1, hasMore: true, totalResults: 4 } })
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'failed' })
    expect(listReservationPage).toHaveBeenCalledTimes(2)
  })
  it('never steals an active worker lease', async () => {
    vi.mocked(persistence.acquireLoRun).mockResolvedValue(run({ acquired: false }) as never)
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'running' })
    expect(listReservationPage).not.toHaveBeenCalled()
  })
  it('holds canonical data on a failed reconciliation detail', async () => {
    vi.mocked(persistence.acquireLoRun).mockResolvedValue(run({ phase: 'reconcile', detailIds: ['cancelled-id'] }) as never)
    vi.mocked(readReservation).mockResolvedValue({ ok: false, status: 404, error: 'OHIP HTTP 404' })
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'failed' })
    expect(persistence.publishLoSync).not.toHaveBeenCalled()
  })
  it('stages cancellation or moved-date details before publication', async () => {
    vi.mocked(persistence.acquireLoRun).mockResolvedValue(run({ phase: 'reconcile', detailIds: ['synthetic'] }) as never)
    const changed = { ...booking, stayState: 'cancelled' as const, reservationStatus: 'Cancelled', arrivalDate: '2027-01-01', departureDate: '2027-01-03' }
    vi.mocked(readReservation).mockResolvedValue({ ok: true, data: changed })
    expect(await advanceLoSync(scope, options)).toMatchObject({ state: 'complete' })
    expect(persistence.stageLoPage).toHaveBeenCalledWith('run', [changed], 'worker')
  })
  it('rejects UAT imports before reading or persistence', async () => {
    vi.stubEnv('ORACLE_OHIP_ENVIRONMENT', 'uat')
    await expect(advanceLoSync(scope, options)).rejects.toThrow('Production Oracle configuration required')
    expect(persistence.acquireLoRun).not.toHaveBeenCalled()
  })
})
