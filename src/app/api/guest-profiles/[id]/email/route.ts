import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { resendGuestEmail } from '@/lib/guest-portal/email-worker'
import { guestErrorResponse,guestPrivateHeaders,readGuestJson } from '@/lib/guest-portal/http'
import { GuestInputError } from '@/lib/guest-portal/types'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function POST(request:Request,context:Context){try{const {id}=await context.params;const command=z.object({mode:z.literal('resend'),reviewedCount:z.literal(1)}).strict().safeParse(await readGuestJson(request));if(!z.uuid().safeParse(id).success||!command.success)throw new GuestInputError('Confirm one guest email');return NextResponse.json(await resendGuestEmail(id,command.data.reviewedCount),{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
