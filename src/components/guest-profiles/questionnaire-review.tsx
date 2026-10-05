'use client'
import { useEffect,useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PrivateGuestAttachment } from '@/components/guest-portal/questionnaire-form'
type Review={guestName:string|null;status:string;answers:{id:string;prompt:string;text:string|null;options:string[];uploadId:string|null}[]}
export function QuestionnaireReview({guestProfileId,onClose}:{guestProfileId:string;onClose:()=>void}){
 const router=useRouter();const [review,setReview]=useState<Review|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/guest-profiles/${guestProfileId}/review`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error??'Unable to load');setReview(data)}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Unable to load')});return()=>controller.abort()},[guestProfileId])
 async function confirm(){setBusy(true);setError('');try{const response=await fetch(`/api/guest-profiles/${guestProfileId}/review`,{method:'POST'});const data=await response.json();if(!response.ok)throw Error(data.error??'Unable to review');router.refresh();onClose()}catch(error){setError(error instanceof Error?error.message:'Unable to review')}finally{setBusy(false)}}
 return <section className="space-y-4 rounded-xl border p-5"><div className="flex justify-between gap-3"><h2 className="text-lg font-semibold">Pre-arrival · {review?.guestName??'Guest'}</h2><Button variant="outline" onClick={onClose}>Close</Button></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{!review&&!error&&<p>Loading answers…</p>}{review?.answers.map(answer=><article key={answer.id} className="rounded-lg bg-muted p-4"><h3 className="text-sm font-medium">{answer.prompt}</h3><p className="mt-2 whitespace-pre-line text-sm">{answer.text??answer.options.join(', ')}</p>{answer.uploadId&&<PrivateGuestAttachment endpoint={`/api/guest-profiles/${guestProfileId}/review?uploadId=${answer.uploadId}`}/>}</article>)}{review?.status==='submitted'&&<Button onClick={confirm} disabled={busy}>{busy?'Reviewing…':'Mark reviewed'}</Button>}{review?.status==='reviewed'&&<p className="text-sm">Reviewed by the team.</p>}</section>
}
