import { NextRequest,NextResponse } from 'next/server'
import { resolveGuestScope } from '@/lib/guest-portal/access'
import { getGuestRequests,submitGuestRequest,guestRequestInputSchema } from '@/lib/guest-portal/requests'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse,guestPrivateHeaders,readGuestJson } from '@/lib/guest-portal/http'
export const dynamic='force-dynamic'
type Context={params:Promise<{token:string}>}
async function scopeFrom(context:Context){const {token}=await context.params;return resolveGuestScope(token)}
export async function GET(_request:NextRequest,context:Context){try{return NextResponse.json(await getGuestRequests(await scopeFrom(context)),{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
export async function POST(request:NextRequest,context:Context){try{const scope=await scopeFrom(context);const parsed=guestRequestInputSchema.safeParse(await readGuestJson(request));if(!parsed.success)throw new GuestInputError('Check the request details');return NextResponse.json(await submitGuestRequest(scope,parsed.data),{status:201,headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
