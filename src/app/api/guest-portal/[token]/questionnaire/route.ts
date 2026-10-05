import { NextRequest, NextResponse } from 'next/server'
import { resolveGuestScope } from '@/lib/guest-portal/access'
import { questionnaireInputSchema, submitQuestionnaire } from '@/lib/guest-portal/questionnaires'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse, guestPrivateHeaders, readGuestJson } from '@/lib/guest-portal/http'
export const dynamic = 'force-dynamic'
export async function POST(request:NextRequest,context:{params:Promise<{token:string}>}) {try {const {token}=await context.params;const scope=await resolveGuestScope(token);const input=questionnaireInputSchema.safeParse(await readGuestJson(request));if(!input.success) throw new GuestInputError('Check your questionnaire answers'); return NextResponse.json(await submitQuestionnaire(scope,input.data),{headers:guestPrivateHeaders})} catch(error) {return guestErrorResponse(error)} }
