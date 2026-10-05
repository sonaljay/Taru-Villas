import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { requireLoPropertyAccess, OracleAccessError } from '@/lib/oracle/access'
import { readHotel } from '@/lib/oracle/client'
export async function POST(request: NextRequest) {
  try {
    const input = z.object({ propertyId: z.string().uuid() }).safeParse(await request.json())
    if (!input.success) return NextResponse.json({ error: 'Property required' }, { status: 400 })
    const scope = await requireLoPropertyAccess(input.data.propertyId)
    const result = await readHotel(scope.oracleHotelId)
    return NextResponse.json(result.ok ? { ok: true, hotelId: result.data.hotelId, hotelName: result.data.hotelName } : result, { status: result.ok ? 200 : result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return NextResponse.json({ error: error instanceof OracleAccessError ? error.message : 'Connection test failed' }, { status: error instanceof OracleAccessError ? error.status : 500 }) }
}
