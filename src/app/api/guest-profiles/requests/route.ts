import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getStaffGuestRequests } from '@/lib/guest-portal/requests'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse,guestPrivateHeaders } from '@/lib/guest-portal/http'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){try{const id=request.nextUrl.searchParams.get('propertyId');if(!z.uuid().safeParse(id).success)throw new GuestInputError('Choose a property');return NextResponse.json(await getStaffGuestRequests(id!),{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
