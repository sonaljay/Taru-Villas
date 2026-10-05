import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/oracle/cron-auth'
import { deliverGuestEmails,enqueueGuestEmails } from '@/lib/guest-portal/email-worker'
import { cleanGuestUploadDrafts } from '@/lib/guest-portal/upload-store'
export const dynamic='force-dynamic'
export const maxDuration=120
export async function POST(request:Request){
 if(!isCronAuthorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
 try{const started=Date.now(),now=new Date();const queued=await enqueueGuestEmails(now);const deliveries=await deliverGuestEmails({now,limit:20,budgetMs:Math.max(0,45000-(Date.now()-started))});const uploads=await cleanGuestUploadDrafts(20);return NextResponse.json({queued,deliveries,uploads},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Guest portal maintenance failed'},{status:500})}
}
export const GET=POST
