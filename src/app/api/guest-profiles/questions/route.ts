import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getPropertyQuestions, savePropertyQuestion } from '@/lib/guest-portal/questionnaires'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse, guestPrivateHeaders, readGuestJson } from '@/lib/guest-portal/http'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) { try { const id = request.nextUrl.searchParams.get('propertyId'); if (!z.uuid().safeParse(id).success) throw new GuestInputError('Property required'); return NextResponse.json(await getPropertyQuestions(id!),{ headers:guestPrivateHeaders }) } catch (error) { return guestErrorResponse(error) } }
export async function POST(request: NextRequest) { try { const input = z.object({ propertyId:z.uuid(), question:z.unknown() }).strict().safeParse(await readGuestJson(request)); if (!input.success) throw new GuestInputError('Check the question definition'); return NextResponse.json(await savePropertyQuestion(input.data.propertyId,input.data.question),{status:201, headers:guestPrivateHeaders}) } catch (error) { return guestErrorResponse(error) } }
export async function PATCH(request:NextRequest){try{const input=z.object({propertyId:z.uuid(),order:z.array(z.uuid()).min(1).max(100)}).strict().safeParse(await readGuestJson(request));if(!input.success)throw new GuestInputError('Check question order');const {reorderPropertyQuestions}=await import('@/lib/guest-portal/questionnaires');await reorderPropertyQuestions(input.data.propertyId,input.data.order);return NextResponse.json({saved:true},{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
