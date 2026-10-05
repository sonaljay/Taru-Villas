import { NextResponse } from 'next/server'
import { GuestInputError } from './types'
import { OracleAccessError } from '@/lib/oracle/access'
export const guestPrivateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
export function guestErrorResponse(error: unknown) {
  const known = error instanceof GuestInputError || error instanceof OracleAccessError
  return NextResponse.json({ error: known ? error.message : 'Unable to complete this request' }, { status: known ? error.status : 500, headers: guestPrivateHeaders })
}
export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new GuestInputError('Request is too large', 413)
  const reader = request.body?.getReader(); if (!reader) throw new GuestInputError('A request body is required')
  const chunks: Uint8Array[] = []; let total = 0
  for (;;) {
    const { value, done } = await reader.read(); if (done) break
    total += value.length; if (total > limit) { await reader.cancel(); throw new GuestInputError('Request is too large',413) }; chunks.push(value)
  }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length }
  return bytes
}
export async function readGuestJson(request: Request) {
  try { return JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 64 * 1024))) as unknown } catch (error) { if (error instanceof GuestInputError) throw error; throw new GuestInputError('Invalid request body') }
}
