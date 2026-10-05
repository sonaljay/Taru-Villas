import { NextResponse } from 'next/server'
import { GuestInputError } from './types'
import { OracleAccessError } from '@/lib/oracle/access'
export const guestPrivateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
export function guestErrorResponse(error: unknown) {
  const known = error instanceof GuestInputError || error instanceof OracleAccessError
  return NextResponse.json({ error: known ? error.message : 'Unable to complete this request' }, { status: known ? error.status : 500, headers: guestPrivateHeaders })
}
