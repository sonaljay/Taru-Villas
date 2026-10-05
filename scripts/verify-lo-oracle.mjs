import { createInterface } from 'node:readline'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parseReservationPage, parseReservationDetail } from '../src/lib/oracle/reservations.ts'
/**
 * Production GET diagnostics only; returns no bearer token, guest values or reservation IDs.
 * @param {{environment:string,gateway:string,clientId:string,clientSecret:string,appKey:string,enterpriseId:string}} config
 * @param {typeof fetch} fetcher
 */
export async function verifyLoOracle(config, fetcher = fetch) {
  if (config.environment !== 'production' || config.gateway !== 'https://mtcs1pr.hospitality-api.ap-singapore-1.ocs.oraclecloud.com' || config.enterpriseId !== 'TVPL') throw Error('Production LO diagnostics only')
  const authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
  const auth = await fetcher(`${config.gateway}/oauth/v1/tokens`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: authorization, 'x-app-key': config.appKey, enterpriseId: config.enterpriseId, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'urn:opc:hgbu:ws:__myscopes__' }) })
  if (!auth.ok) return { authentication: { status: auth.status } }
  const credentials = await auth.json()
  if (typeof credentials.access_token !== 'string' || !credentials.access_token) throw Error('Invalid authentication response')
  const get = (path) => fetcher(`${config.gateway}${path}`, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${credentials.access_token}`, 'x-app-key': config.appKey, 'x-hotelid': 'LO' } })
  const hotel = await get('/ent/config/v1/hotels/LO')
  const metadata = hotel.ok ? (await hotel.json()).hotelConfigInfo : null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })
  const end = new Date(new Date(`${today}T00:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0,10)
  const arrivals = await get(`/rsv/v1/hotels/LO/reservations?arrivalStartDate=${today}&arrivalEndDate=${end}&limit=2&offset=0&recentlyAccessed=false`)
  const result = arrivals.ok && arrivals.status !== 204 ? await arrivals.json() : null
  const rows = Array.isArray(result?.reservations?.reservationInfo) ? result.reservations.reservationInfo : []
  const count = rows.length
  const first = rows[0]
  const id = first?.reservationIdList?.find(i => i.type === 'Reservation')?.id
  let normalizedList = false
  try { parseReservationPage(result, { offset: 0, limit: 2 }); normalizedList = true } catch { /* Safe diagnostic only. */ }
  // Only typed pagination counters; never serialize arbitrary upstream values.
  const pagination = (value) => ({
    hasMore: typeof value?.hasMore === 'boolean' ? value.hasMore : null,
    offset: typeof value?.offset === 'number' || /^\d+$/.test(String(value?.offset)) ? Number(value.offset) : null,
    totalResults: typeof value?.totalResults === 'number' || /^\d+$/.test(String(value?.totalResults)) ? Number(value.totalResults) : null,
  })
  const safe = {
    authentication: { status: auth.status },
    hotel: { status: hotel.status, hotelId: metadata?.hotelId === 'LO' ? 'LO' : null, hotelName: typeof metadata?.hotelName === 'string' ? metadata.hotelName : null },
    arrivals: { status: arrivals.status, count, normalized: normalizedList, pagination: { envelope: pagination(result?.reservations), root: pagination(result) }, fields: {
      typedReservationId: !!id, name: !!(first?.reservationGuest?.givenName || first?.reservationGuest?.surname),
      email: !!first?.reservationGuest?.email, phone: !!first?.reservationGuest?.phoneNumber,
      arrival: !!first?.roomStay?.arrivalDate, departure: !!first?.roomStay?.departureDate,
      roomQuantity: first?.roomStay?.numberOfRooms != null, status: !!first?.reservationStatus,
    } },
    detail: /** @type {{status:number, normalized:boolean, fields:{stay:boolean, guests:boolean}} | null} */ (null),
  }
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    const detail = await get(`/rsv/v1/hotels/LO/reservations/${encodeURIComponent(id)}`)
    const detailBody = detail.ok ? await detail.json() : null
    const row = detailBody?.reservations?.reservation?.[0]
    let normalizedDetail = false
    try { parseReservationDetail(detailBody); normalizedDetail = true } catch { /* Safe diagnostic only. */ }
    safe.detail = { status: detail.status, normalized: normalizedDetail, fields: { stay: !!row?.roomStay, guests: Array.isArray(row?.reservationGuests) } }
  }
  return safe
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const terminal = process.stdin.isTTY
  if (terminal) execFileSync('stty', ['-echo'], { stdio: 'inherit' })
  const input = createInterface({ input: process.stdin, terminal: false })
  input.once('line', async line => {
    try { console.log(JSON.stringify(await verifyLoOracle(JSON.parse(line)), null, 2)) }
    catch { console.error('LO verification failed'); process.exitCode = 1 }
    finally { if (terminal) execFileSync('stty', ['echo'], { stdio: 'inherit' }); input.close(); process.exit(process.exitCode ?? 0) }
  })
}
