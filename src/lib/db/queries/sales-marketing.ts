import { requireLoPropertyAccess } from '@/lib/oracle/access'
import { getOracleBookingsForProperty } from './guest-profiles'
import { getLoSyncStatus } from './oracle-sync'
import { aggregateRoomNights, inclusiveLastDate, validateReportRange, type ReportRange } from '@/lib/sales-marketing/room-nights'
export async function getLoBookingReport(propertyId: string, range: ReportRange) {
  const scope = await requireLoPropertyAccess(propertyId)
  validateReportRange(range)
  const [bookings, sync] = await Promise.all([
    getOracleBookingsForProperty(scope.orgId, scope.propertyId),
    getLoSyncStatus(scope.orgId, scope.propertyId),
  ])
  const coverageComplete = !!sync.lastSuccessAt && !!sync.fromDate && !!sync.toDate && sync.fromDate <= range.fromDate && sync.toDate >= inclusiveLastDate(range.toDateExclusive)
  return { report: aggregateRoomNights(bookings, range), sync, coverageComplete }
}
export type LoBookingReport = Awaited<ReturnType<typeof getLoBookingReport>>
