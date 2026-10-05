import { createHash } from 'node:crypto'
import type { OhipResult, OracleBooking, OraclePage, NormalizedArrival, NormalizedReservation } from './types'
import { parseReservationPage, parseReservationDetail, validOracleDate } from './reservations'

const GATEWAYS = {
  production: 'https://mtcs1pr.hospitality-api.ap-singapore-1.ocs.oraclecloud.com',
  uat: 'https://mtcs1ua.hospitality-api.ap-singapore-1.ocs.oc-test.com',
} as const
interface Config { gateway: string; clientId: string; clientSecret: string; appKey: string; enterpriseId: string; scope: string; key: string }
interface Cached { token: string; expiresAt: number }
const cache = new Map<string, Cached>()
const pending = new Map<string, Promise<OhipResult<string>>>()
const fail = (error: string, status = 502): OhipResult<never> => ({ ok: false, status, error })
function config(): Config | null {
  const environment = process.env.ORACLE_OHIP_ENVIRONMENT ?? 'production'
  if (environment !== 'production' && environment !== 'uat') return null
  const gateway = process.env.ORACLE_OHIP_GATEWAY?.replace(/\/$/, '')
  const clientId = process.env.ORACLE_OHIP_CLIENT_ID
  const clientSecret = process.env.ORACLE_OHIP_CLIENT_SECRET
  const appKey = process.env.ORACLE_OHIP_APP_KEY
  const enterpriseId = process.env.ORACLE_OHIP_ENTERPRISE_ID
  const scope = process.env.ORACLE_OHIP_SCOPE ?? 'urn:opc:hgbu:ws:__myscopes__'
  if (gateway !== GATEWAYS[environment] || !clientId || !clientSecret || !appKey || enterpriseId !== 'TVPL' || scope !== 'urn:opc:hgbu:ws:__myscopes__') return null
  const key = createHash('sha256').update(JSON.stringify([environment, gateway, clientId, clientSecret, appKey, enterpriseId, scope])).digest('hex')
  return { gateway, clientId, clientSecret, appKey, enterpriseId, scope, key }
}
async function authenticate(cfg: Config): Promise<OhipResult<string>> {
  try {
    const response = await fetch(`${cfg.gateway}/oauth/v1/tokens`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`, 'x-app-key': cfg.appKey, enterpriseId: cfg.enterpriseId, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: cfg.scope }),
    })
    if (!response.ok) return fail(`OHIP authentication HTTP ${response.status}`)
    const data = await response.json().catch(() => null)
    if (!data || typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 60) return fail('OHIP invalid authentication response')
    if (cache.size > 3) cache.clear()
    cache.set(cfg.key, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
    return { ok: true, data: data.access_token }
  } catch { return fail('OHIP network failure') }
}
async function accessToken(cfg: Config): Promise<OhipResult<string>> {
  const existing = cache.get(cfg.key)
  if (existing && existing.expiresAt > Date.now() + 60_000) return { ok: true, data: existing.token }
  const inFlight = pending.get(cfg.key)
  if (inFlight) return inFlight
  const promise = authenticate(cfg).finally(() => pending.delete(cfg.key))
  pending.set(cfg.key, promise)
  return promise
}
// Private GET-only transport. Every consumer uses one of the fixed-path wrappers below.
async function read(hotelId: string, path: string): Promise<OhipResult<unknown>> {
  if (hotelId !== 'LO') return fail('Unsupported Oracle hotel', 400)
  const cfg = config()
  if (!cfg) return fail('Oracle OHIP not configured', 503)
  const deadline = Date.now() + 20_000
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(cfg)
    if (!token.ok) return token
    const remaining = deadline - Date.now()
    if (remaining <= 0) return fail('OHIP request timed out')
    try {
      const response = await fetch(`${cfg.gateway}${path}`, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(remaining),
        headers: { Authorization: `Bearer ${token.data}`, 'x-app-key': cfg.appKey, 'x-hotelid': hotelId, Accept: 'application/json' },
      })
      if (response.status === 401 && attempt === 0) {
        if (cache.get(cfg.key)?.token === token.data) cache.delete(cfg.key)
        continue
      }
      if (!response.ok) return fail(`OHIP HTTP ${response.status}`, response.status === 404 ? 404 : 502)
      if (response.status === 204) return { ok: true, data: null }
      try { return { ok: true, data: await response.json() } }
      catch { return fail('OHIP invalid response') }
    } catch { return fail('OHIP network failure') }
  }
  return fail('OHIP authentication failed')
}
export async function listReservationPage(hotelId: string, search: { fromDate?: string; toDate?: string; searchType?: 'InHouse'; offset: number; limit: number }): Promise<OhipResult<OraclePage>> {
  if (!Number.isInteger(search.offset) || search.offset < 0 || !Number.isInteger(search.limit) || search.limit < 1 || search.limit > 200 ||
    (search.fromDate !== undefined && !validOracleDate(search.fromDate)) || (search.toDate !== undefined && !validOracleDate(search.toDate)) ||
    (search.fromDate && search.toDate && search.toDate < search.fromDate)) return fail('Invalid Oracle search', 400)
  const qs = new URLSearchParams({ limit: String(search.limit), offset: String(search.offset), recentlyAccessed: 'false' })
  if (search.fromDate) qs.set('arrivalStartDate', search.fromDate)
  if (search.toDate) qs.set('arrivalEndDate', search.toDate)
  if (search.searchType) qs.set('searchType', search.searchType)
  const result = await read(hotelId, `/rsv/v1/hotels/${hotelId}/reservations?${qs}`)
  if (!result.ok) return result
  if (result.data === null) return { ok: true, data: { bookings: [], offset: search.offset, hasMore: false, totalResults: 0 } }
  try { return { ok: true, data: parseReservationPage(result.data) } }
  catch { return fail('OHIP invalid reservation list') }
}
export async function readReservation(hotelId: string, reservationId: string): Promise<OhipResult<OracleBooking>> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(reservationId)) return fail('Invalid Oracle identifier', 400)
  const result = await read(hotelId, `/rsv/v1/hotels/${hotelId}/reservations/${encodeURIComponent(reservationId)}`)
  if (!result.ok) return result
  try {
    const booking = parseReservationDetail(result.data)
    if (booking.oracleReservationId !== reservationId) return fail('OHIP reservation identifier mismatch')
    return { ok: true, data: booking }
  } catch { return fail('OHIP invalid reservation detail') }
}
export async function readHotel(hotelId: string): Promise<OhipResult<{ hotelId: string; hotelName: string }>> {
  const result = await read(hotelId, `/ent/config/v1/hotels/${hotelId}`)
  if (!result.ok) return result
  const info = (result.data as { hotelConfigInfo?: { hotelId?: string; hotelName?: string } } | null)?.hotelConfigInfo
  if (!info || info.hotelId !== hotelId || typeof info.hotelName !== 'string' || !info.hotelName.trim()) return fail('OHIP invalid hotel metadata')
  return { ok: true, data: { hotelId: info.hotelId, hotelName: info.hotelName } }
}
export async function listArrivals(hotelId: string, fromDate: string, toDate: string, opts: { limit?: number; offset?: number } = {}): Promise<OhipResult<NormalizedArrival[]>> {
  const result = await listReservationPage(hotelId, { fromDate, toDate, offset: opts.offset ?? 0, limit: opts.limit ?? 200 })
  return result.ok ? { ok: true, data: result.data.bookings } : result
}
export async function getReservation(hotelId: string, reservationId: string): Promise<OhipResult<NormalizedReservation>> {
  return readReservation(hotelId, reservationId)
}
export async function postPreArrival(_hotelId: string, _reservationId: string, _payload: { eta: string | null; comment: string }): Promise<OhipResult<true>> {
  void [_hotelId, _reservationId, _payload]
  return fail('Oracle write-back is disabled', 405)
}
export async function testConnection(): Promise<OhipResult<true>> {
  const cfg = config()
  if (!cfg) return fail('Oracle OHIP not configured', 503)
  const token = await accessToken(cfg)
  return token.ok ? { ok: true, data: true } : token
}
