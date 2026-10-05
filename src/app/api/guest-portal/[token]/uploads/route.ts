import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { resolveGuestScope } from '@/lib/guest-portal/access'
import { saveGuestUpload,readGuestUpload,deleteGuestUpload } from '@/lib/guest-portal/uploads'
import { GuestInputError } from '@/lib/guest-portal/types'
import { guestErrorResponse,guestPrivateHeaders,readBoundedBody } from '@/lib/guest-portal/http'
export const dynamic='force-dynamic'
type Context={params:Promise<{token:string}>}
async function scopeFrom(context:Context) {const {token}=await context.params;return resolveGuestScope(token)}
function uploadId(request:NextRequest) {const id=request.nextUrl.searchParams.get('uploadId');if(!z.uuid().safeParse(id).success) throw new GuestInputError('File unavailable',404);return id!}
export async function POST(request:NextRequest,context:Context) {try {const scope=await scopeFrom(context); const type=request.headers.get('content-type');if(!type?.startsWith('multipart/form-data;')) throw new GuestInputError('Choose a file');const bytes=await readBoundedBody(request,8*1024*1024+65536);const form=await new Response(bytes as BodyInit,{headers:{'content-type':type}}).formData();const files=form.getAll('file');if(files.length!==1 || [...form.keys()].some(key=>key!=='file') || !(files[0] instanceof File)) throw new GuestInputError('Choose one file'); return NextResponse.json(await saveGuestUpload(scope,files[0]),{status:201,headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
export async function GET(request:NextRequest,context:Context){try{return NextResponse.json(await readGuestUpload(await scopeFrom(context),uploadId(request)),{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
export async function DELETE(request:NextRequest,context:Context){try{await deleteGuestUpload(await scopeFrom(context),uploadId(request));return NextResponse.json({removed:true},{headers:guestPrivateHeaders})}catch(error){return guestErrorResponse(error)}}
