import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { savePropertyQuestion } from '@/lib/guest-portal/questionnaires'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse, guestPrivateHeaders, readGuestJson } from '@/lib/guest-portal/http'
export const dynamic = 'force-dynamic'
export async function PATCH(request: NextRequest, context:{params:Promise<{id:string}>}) { try { const {id}=await context.params; const input=z.object({propertyId:z.uuid(),question:z.unknown()}).strict().safeParse(await readGuestJson(request)); if (!z.uuid().safeParse(id).success || !input.success) throw new GuestInputError('Check the question definition'); return NextResponse.json(await savePropertyQuestion(input.data.propertyId,input.data.question,id),{headers:guestPrivateHeaders}) } catch(error) {return guestErrorResponse(error)} }
