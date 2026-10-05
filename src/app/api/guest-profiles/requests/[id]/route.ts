import { NextRequest,NextResponse } from 'next/server'
import { updateGuestRequest,staffRequestUpdateSchema } from '@/lib/guest-portal/requests'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse,guestPrivateHeaders,readGuestJson } from '@/lib/guest-portal/http'
export const dynamic='force-dynamic'
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){try{const {id}=await context.params;const parsed=staffRequestUpdateSchema.safeParse(await readGuestJson(request));if(!parsed.success)throw new GuestInputError('Check the request update');await updateGuestRequest(id,parsed.data);return NextResponse.json({saved:true},{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
