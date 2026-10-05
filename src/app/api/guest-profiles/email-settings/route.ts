import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { activateGuestEmails,catchUpGuestEmails,getGuestEmailSettings,previewGuestEmailActivation } from '@/lib/guest-portal/email-worker'
import { guestErrorResponse,guestPrivateHeaders,readGuestJson } from '@/lib/guest-portal/http'
import { GuestInputError } from '@/lib/guest-portal/types'
export const dynamic='force-dynamic'
const command=z.object({propertyId:z.uuid(),mode:z.enum(['preview','activate','catch_up']),reviewedCount:z.number().int().min(0).optional(),version:z.uuid().optional()}).strict()
export async function GET(request:NextRequest){try{const propertyId=z.uuid().safeParse(request.nextUrl.searchParams.get('propertyId'));if(!propertyId.success)throw new GuestInputError('Property required');return NextResponse.json(await getGuestEmailSettings(propertyId.data),{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
export async function POST(request:Request){try{const parsed=command.safeParse(await readGuestJson(request));if(!parsed.success)throw new GuestInputError('Invalid email setup request');const input=parsed.data;if(input.mode==='preview')return NextResponse.json(await previewGuestEmailActivation(input.propertyId),{headers:guestPrivateHeaders});if(input.reviewedCount===undefined||!input.version)throw new GuestInputError('Review the booking count first');if(input.mode==='activate'){await activateGuestEmails(input.propertyId,input.reviewedCount,input.version);return NextResponse.json({ok:true},{headers:guestPrivateHeaders})}return NextResponse.json(await catchUpGuestEmails(input.propertyId,input.reviewedCount,input.version),{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
