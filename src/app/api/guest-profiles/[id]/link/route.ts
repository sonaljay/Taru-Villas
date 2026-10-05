import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { issueGuestLink, revokeGuestLink } from '@/lib/guest-portal/access'
import { guestErrorResponse, guestPrivateHeaders } from '@/lib/guest-portal/http'
import { GuestInputError } from '@/lib/guest-portal/types'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
async function idFrom(context: Context) { const { id } = await context.params; if (!z.uuid().safeParse(id).success) throw new GuestInputError('Booking unavailable', 404); return id }
export async function POST(_request: NextRequest, context: Context) {
  try { return NextResponse.json(await issueGuestLink(await idFrom(context)), { headers: guestPrivateHeaders }) } catch (error) { return guestErrorResponse(error) }
}
export async function DELETE(_request: NextRequest, context: Context) {
  try { await revokeGuestLink(await idFrom(context)); return NextResponse.json({ revoked: true }, { headers: guestPrivateHeaders }) } catch (error) { return guestErrorResponse(error) }
}
