import { createHash } from 'node:crypto'
import { listReservationPage, readReservation } from './client'
import { validOracleDate } from './reservations'
import { acquireLoRun, stageLoPage, saveLoCursor, advanceLoPhase, getLoDetailIds, publishLoSync, failLoSync, releaseLoLease, OracleLeaseError } from '@/lib/db/queries/oracle-sync'
export { getLoSyncStatus } from '@/lib/db/queries/oracle-sync'
export class OracleProtocolError extends Error {}
function windows(from: string, to: string): Array<{ fromDate: string; toDate: string }> {
  const result: Array<{ fromDate: string; toDate: string }> = []
  let cursor = from
  while (cursor <= to) {
    const [y, m] = cursor.split('-').map(Number)
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    result.push({ fromDate: cursor, toDate: end < to ? end : to })
    cursor = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  }
  return result
}
export async function advanceLoSync(scope: { orgId: string; propertyId: string }, options: { fromDate: string; toDate: string; budgetMs: number }): Promise<{ runId: string; state: 'running' | 'complete' | 'failed'; processed: number; error?: string }> {
  if ((process.env.ORACLE_OHIP_ENVIRONMENT ?? 'production') !== 'production') throw new OracleProtocolError('Production Oracle configuration required')
  if (!validOracleDate(options.fromDate) || !validOracleDate(options.toDate) || options.toDate < options.fromDate || new Date(options.toDate).getTime() - new Date(options.fromDate).getTime() > 366 * 86400000) throw new OracleProtocolError('Invalid sync range')
  const started = Date.now()
  const run = await acquireLoRun(scope, { fromDate: options.fromDate, toDate: options.toDate })
  if (!run.acquired || !run.leaseOwner) return { runId: run.id, state: 'running', processed: 0 }
  const owner = run.leaseOwner, months = windows(run.fromDate, run.toDate)
  let phase = run.phase, offset = run.offset, detailIds = run.detailIds, fingerprint = run.lastPageFingerprint, processed = 0
  const next = async (newPhase: string) => {
    detailIds = newPhase === 'reconcile' || newPhase === 'enrich' ? await getLoDetailIds(run.id, newPhase) : []
    await advanceLoPhase(run.id, newPhase, owner, detailIds)
    phase = newPhase; offset = 0; fingerprint = null
  }
  try {
    while (Date.now() - started < Math.max(0, options.budgetMs - 21_000)) {
      if (phase.startsWith('arrivals:') || phase === 'inhouse') {
        const index = phase.startsWith('arrivals:') ? Number(phase.slice(9)) : -1
        if (index >= months.length || !Number.isInteger(index)) throw new OracleProtocolError('Invalid sync phase')
        const search = index >= 0 ? { ...months[index], offset, limit: 100 } : { searchType: 'InHouse' as const, offset, limit: 100 }
        const result = await listReservationPage('LO', search)
        if (!result.ok) throw new OracleProtocolError(result.error)
        const page = result.data
        const newFingerprint = createHash('sha256').update(page.bookings.map(b => b.oracleReservationId).join('\n')).digest('hex')
        if (page.offset !== offset || (page.hasMore && !page.bookings.length) || (page.bookings.length && newFingerprint === fingerprint)) throw new OracleProtocolError('Oracle pagination made no progress')
        if (page.totalResults !== null && (offset + page.bookings.length > page.totalResults || (!page.hasMore && offset + page.bookings.length !== page.totalResults) || (page.hasMore && offset + page.bookings.length >= page.totalResults))) throw new OracleProtocolError('Contradictory Oracle pagination')
        if (page.totalResults !== null && page.totalResults > 20_000) throw new OracleProtocolError('Oracle sync record limit exceeded')
        await stageLoPage(run.id, page.bookings, owner)
        processed += page.bookings.length
        offset += page.bookings.length; fingerprint = newFingerprint
        await saveLoCursor(run.id, { phase, offset, lastPageFingerprint: fingerprint }, owner)
        if (!page.hasMore) await next(index >= 0 ? index + 1 < months.length ? `arrivals:${index + 1}` : 'inhouse' : 'reconcile')
      } else if (phase === 'reconcile' || phase === 'enrich') {
        if (offset >= detailIds.length) { await next(phase === 'reconcile' ? 'enrich' : 'publish'); continue }
        const result = await readReservation('LO', detailIds[offset])
        if (!result.ok) throw new OracleProtocolError(result.error)
        await stageLoPage(run.id, [result.data], owner)
        processed++; offset++
        await saveLoCursor(run.id, { phase, offset }, owner)
      } else if (phase === 'publish') {
        await publishLoSync(run.id, owner)
        return { runId: run.id, state: 'complete', processed }
      } else throw new OracleProtocolError('Invalid sync phase')
    }
    await releaseLoLease(run.id, owner)
    return { runId: run.id, state: 'running', processed }
  } catch (error) {
    if (error instanceof OracleLeaseError) return { runId: run.id, state: 'running', processed }
    const category = error instanceof OracleProtocolError ? error.message : 'Oracle synchronization failed'
    await failLoSync(run.id, owner, category)
    return { runId: run.id, state: 'failed', processed, error: category }
  }
}
