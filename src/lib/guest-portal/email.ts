import { z } from 'zod/v4'
import { guestPortalOrigin } from './access'
import { validOracleDate } from '@/lib/oracle/reservations'
import { GuestInputError } from './types'
export type GuestEmailMessage={to:string;subject:string;html:string;text:string;idempotencyKey:string}
export function validGuestEmail(value:string|null|undefined):string|null{
 const candidate=value?.trim();return candidate&&candidate.length<=254&&z.email().safeParse(candidate).success?candidate:null
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!))}
export function renderGuestEmail(input:{propertyName:string;arrivalDate:string;departureDate:string;portalUrl:string}):{subject:string;html:string;text:string}{
 let url:URL;try{url=new URL(input.portalUrl)}catch{throw new GuestInputError('Guest email link unavailable',503)}
 if(url.origin!==guestPortalOrigin()||url.username||url.password||url.search||url.hash||!/^\/stay\/[A-Za-z0-9_-]+$/.test(url.pathname))throw new GuestInputError('Guest email link unavailable',503)
 if(!validOracleDate(input.arrivalDate)||!validOracleDate(input.departureDate)||input.departureDate<=input.arrivalDate)throw new GuestInputError('Guest email dates unavailable',503)
 const property=input.propertyName.replace(/[\r\n]+/g,' ').trim().slice(0,150)||'Taru Villas'
 const date=(value:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`))
 const arrival=date(input.arrivalDate),departure=date(input.departureDate),subject=`Your stay at ${property}`
 const introduction='We look forward to welcoming you. Your private guest portal brings everything for your stay together.'
 const features='Share your pre-arrival details, explore our menus and excursions, and send guest requests to the villa team.'
 const closing='Dining and experience requests are confirmed by our team. Keep this link private and share it only with people on your reservation.'
 const text=`TARU VILLAS\n\nYour stay at ${property}\nArrival: ${arrival}\nDeparture: ${departure}\n\n${introduction}\n\n${features}\n\nOpen your guest portal:\n${url.href}\n\n${closing}\n\nWe look forward to looking after you.\nThe Taru Villas team`
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f7f5ef;color:#243b32;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px"><table role="presentation" style="width:100%;max-width:600px;margin:auto;border-collapse:collapse"><tr><td style="padding:24px 0;border-bottom:1px solid #d9ddd4;font-family:Georgia,serif;font-size:25px;letter-spacing:3px">TARU VILLAS</td></tr><tr><td style="padding:36px 0"><p style="font-size:12px;letter-spacing:2px;text-transform:uppercase">A stay to look forward to</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:34px;line-height:1.2">Your stay at ${escapeHtml(property)}</h1><p style="font-size:15px;line-height:1.7">${introduction}</p><p style="padding:20px 0;border-top:1px solid #d9ddd4;border-bottom:1px solid #d9ddd4;font-size:14px;line-height:1.8"><strong>Arrival</strong> · ${arrival}<br><strong>Departure</strong> · ${departure}</p><p style="font-size:15px;line-height:1.7">${features}</p><p style="padding:16px 0"><a href="${escapeHtml(url.href)}" style="display:inline-block;background:#243b32;color:#ffffff;text-decoration:none;padding:15px 22px;border-radius:6px;font-size:15px">Open your guest portal</a></p><p style="font-size:12px;line-height:1.7;color:#5b6c61">${closing}</p><p style="margin-top:30px;font-size:14px;line-height:1.7">We look forward to looking after you.<br>The Taru Villas team</p></td></tr></table></td></tr></table></body></html>`
 return {subject,html,text}
}
export async function sendGuestEmail(input:GuestEmailMessage):Promise<{providerId:string}>{
 const apiKey=process.env.RESEND_API_KEY?.trim(),from=process.env.GUEST_EMAIL_FROM?.trim()
 if(!apiKey||!from||/[\r\n]/.test(apiKey+from))throw new GuestInputError('Guest email sender is not configured',503)
 guestPortalOrigin()
 if(!validGuestEmail(input.to)||!input.subject||/[\r\n]/.test(input.subject)||input.subject.length>200||!input.html||!input.text||input.html.length>100000||input.text.length>100000||!/^[A-Za-z0-9_\-/:.]{1,256}$/.test(input.idempotencyKey))throw new GuestInputError('Guest email details are invalid',503)
 let response:Response
 try{response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':input.idempotencyKey},body:JSON.stringify({from,to:[input.to],subject:input.subject,html:input.html,text:input.text})})}catch{throw new GuestInputError('Email provider unavailable',503)}
 if(!response.ok)throw new GuestInputError(`Email provider returned ${response.status}`,503)
 let body:unknown;try{body=await response.json()}catch{throw new GuestInputError('Email provider did not acknowledge acceptance',503)}
 if(!body||typeof body!=='object'||!('id'in body)||typeof body.id!=='string'||!body.id||body.id.length>255)throw new GuestInputError('Email provider did not acknowledge acceptance',503)
 return {providerId:body.id}
}
