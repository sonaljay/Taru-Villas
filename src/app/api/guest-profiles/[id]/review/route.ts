import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getStaffQuestionnaire, reviewQuestionnaire } from '@/lib/guest-portal/questionnaires'
import { readStaffGuestUpload } from '@/lib/guest-portal/uploads'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse, guestPrivateHeaders } from '@/lib/guest-portal/http'
export const dynamic = 'force-dynamic'
type Context={params:Promise<{id:string}>}
async function idFrom(context:Context) { const {id}=await context.params; if (!z.uuid().safeParse(id).success) throw new GuestInputError('Booking unavailable',404); return id }
export async function GET(request:NextRequest,context:Context) { try {const id=await idFrom(context); const uploadId=request.nextUrl.searchParams.get('uploadId'); if (uploadId && !z.uuid().safeParse(uploadId).success) throw new GuestInputError('File unavailable',404); return NextResponse.json(uploadId ? await readStaffGuestUpload(id,uploadId) : await getStaffQuestionnaire(id),{headers:guestPrivateHeaders})} catch(error) {return guestErrorResponse(error)} }
export async function POST(_request:NextRequest,context:Context) { try {await reviewQuestionnaire(await idFrom(context));return NextResponse.json({status:'reviewed'},{headers:guestPrivateHeaders})} catch(error) {return guestErrorResponse(error)} }
