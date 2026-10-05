import { createHash } from 'node:crypto'
import { and,desc,eq,gte,sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { db } from '@/lib/db'
import { guestRequests,guestRequestEvents,guestProfiles,excursions,menus,menuCategories,menuItems } from '@/lib/db/schema'
import { getProfile } from '@/lib/auth/guards'
import { requireLoPropertyAccess } from '@/lib/oracle/access'
import { validOracleDate } from '@/lib/oracle/reservations'
import { withGuestAction,withStaffGuestBooking } from './access'
import { publicGuestRequest } from './queries'
import { GuestInputError,type GuestScope,type GuestRequestInput,type PublicGuestRequest,type StaffGuestRequest } from './types'
export const guestRequestInputSchema=z.object({submissionId:z.uuid(),kind:z.enum(['dining','excursion','service']),itemId:z.uuid().optional(),itemKind:z.enum(['menu_item','set_menu','excursion']).optional(),notes:z.string().trim().max(4000),requestedDate:z.string().optional(),requestedTime:z.string().optional(),partySize:z.number().int().min(1).max(50).optional(),quantity:z.number().int().min(1).max(50).optional()}).strict()
export function validateGuestRequestInput(source:{arrivalDate:string|null;departureDate:string|null;stayState:string},input:unknown):GuestRequestInput{
 const parsed=guestRequestInputSchema.safeParse(input);if(!parsed.success)throw new GuestInputError('Check the request details')
 const value=parsed.data
 if(value.kind==='service'){if(source.stayState!=='in_house')throw new GuestInputError('Service requests open during your stay',409);if(value.itemId||value.itemKind||!value.notes)throw new GuestInputError('Describe the assistance you need')}
 else if(!value.itemId||!value.itemKind||(value.kind==='dining'&&!['menu_item','set_menu'].includes(value.itemKind))||(value.kind==='excursion'&&value.itemKind!=='excursion'))throw new GuestInputError('Choose a listed menu or experience')
 if(value.requestedDate&&(!validOracleDate(value.requestedDate)||!source.arrivalDate||!source.departureDate||value.requestedDate<source.arrivalDate||value.requestedDate>source.departureDate))throw new GuestInputError('Choose a date within your stay')
 if(value.requestedTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.requestedTime))throw new GuestInputError('Choose a valid time')
 return value
}
export function requestPayloadHash(input:GuestRequestInput){return createHash('sha256').update(JSON.stringify({kind:input.kind,itemId:input.itemId??null,itemKind:input.itemKind??null,notes:input.notes.trim(),requestedDate:input.requestedDate??null,requestedTime:input.requestedTime??null,partySize:input.partySize??null,quantity:input.quantity??null})).digest('hex')}
export function assertRequestTransition(from:PublicGuestRequest['state'],to:PublicGuestRequest['state'],correctionReason?:string){
 if(from===to)return
 const allowed=from==='received'?['in_progress','completed','declined']:from==='in_progress'?['completed','declined']:[]
 if(allowed.includes(to))return
 if(['completed','declined'].includes(from)&&correctionReason&&correctionReason.trim().length>=5)return
 throw new GuestInputError('This request state cannot change without an explicit terminal correction',409)
}
export async function submitGuestRequest(scope:GuestScope,input:GuestRequestInput):Promise<PublicGuestRequest>{
 return withGuestAction(scope,async(source,tx)=>{
  const value=validateGuestRequestInput(source,input),hash=requestPayloadHash(value)
  const where=and(eq(guestRequests.orgId,source.orgId),eq(guestRequests.propertyId,source.propertyId),eq(guestRequests.guestProfileId,source.id))
  const [existing]=await tx.select().from(guestRequests).where(and(where,eq(guestRequests.submissionId,value.submissionId))).limit(1)
  if(existing){if(existing.payloadHash!==hash)throw new GuestInputError('This request ID was already used for different details',409);return publicGuestRequest(existing)}
  const [count]=await tx.select({count:sql<number>`count(*)::int`}).from(guestRequests).where(and(where,eq(guestRequests.accessId,scope.accessId),gte(guestRequests.createdAt,new Date(Date.now()-3600000))))
  if(count.count>=10)throw new GuestInputError('Please wait before sending more requests, or contact the villa team',429)
  let title='Guest assistance',priceNote:string|null=null
  if(value.itemKind==='excursion'){
   const [item]=await tx.select().from(excursions).where(and(eq(excursions.id,value.itemId!),eq(excursions.propertyId,source.propertyId),eq(excursions.isActive,true))).for('share')
   if(!item)throw new GuestInputError('This experience is currently unavailable');title=item.title;priceNote=item.price
  }else if(value.itemKind==='set_menu'){
   const [item]=await tx.select().from(menus).where(and(eq(menus.id,value.itemId!),eq(menus.propertyId,source.propertyId),eq(menus.isActive,true),eq(menus.type,'set'))).for('share')
   if(!item)throw new GuestInputError('This menu is currently unavailable');title=item.name;priceNote=item.priceNote
  }else if(value.itemKind==='menu_item'){
   const [item]=await tx.select({title:menuItems.title,price:menuItems.price}).from(menuItems).innerJoin(menuCategories,eq(menuCategories.id,menuItems.categoryId)).innerJoin(menus,eq(menus.id,menuCategories.menuId)).where(and(eq(menuItems.id,value.itemId!),eq(menuCategories.propertyId,source.propertyId),eq(menus.propertyId,source.propertyId),eq(menuItems.isActive,true),eq(menuCategories.isActive,true),eq(menus.isActive,true))).for('share')
   if(!item)throw new GuestInputError('This dish is currently unavailable');title=item.title;priceNote=item.price
  }
  const [row]=await tx.insert(guestRequests).values({orgId:source.orgId,propertyId:source.propertyId,guestProfileId:source.id,accessId:scope.accessId,submissionId:value.submissionId,payloadHash:hash,kind:value.kind,itemId:value.itemId??null,itemKind:value.itemKind??null,title,priceNote,notes:value.notes,requestedDate:value.requestedDate??null,requestedTime:value.requestedTime??null,partySize:value.partySize??null,quantity:value.quantity??null}).returning()
  return publicGuestRequest(row)
 })
}
export async function getGuestRequests(scope:GuestScope):Promise<PublicGuestRequest[]>{return (await db.select().from(guestRequests).where(and(eq(guestRequests.orgId,scope.orgId),eq(guestRequests.propertyId,scope.propertyId),eq(guestRequests.guestProfileId,scope.guestProfileId))).orderBy(desc(guestRequests.createdAt))).map(publicGuestRequest)}
export async function getStaffGuestRequests(propertyId:string):Promise<StaffGuestRequest[]>{
 const scope=await requireLoPropertyAccess(propertyId)
 const rows=await db.select({request:guestRequests,guestName:guestProfiles.guestName,roomNumber:guestProfiles.roomNumber}).from(guestRequests).innerJoin(guestProfiles,and(eq(guestProfiles.id,guestRequests.guestProfileId),eq(guestProfiles.orgId,guestRequests.orgId),eq(guestProfiles.propertyId,guestRequests.propertyId))).where(and(eq(guestRequests.orgId,scope.orgId),eq(guestRequests.propertyId,propertyId))).orderBy(desc(guestRequests.createdAt))
 return rows.map(({request,guestName,roomNumber})=>({...publicGuestRequest(request),guestProfileId:request.guestProfileId,guestName,roomNumber,internalNote:request.internalNote,version:request.version}))
}
export const staffRequestUpdateSchema=z.object({version:z.number().int().positive(),state:z.enum(['received','in_progress','completed','declined']),publicReply:z.string().trim().max(2000).optional(),internalNote:z.string().trim().max(4000).optional(),correctionReason:z.string().trim().min(5).max(1000).optional()}).strict()
export async function updateGuestRequest(id:string,input:z.infer<typeof staffRequestUpdateSchema>):Promise<void>{
 const actor=await getProfile();if(!actor)throw new GuestInputError('Unauthorized',401);if(!z.uuid().safeParse(id).success)throw new GuestInputError('Request unavailable',404)
 const parsed=staffRequestUpdateSchema.safeParse(input);if(!parsed.success)throw new GuestInputError('Check the request update')
 const [initial]=await db.select().from(guestRequests).where(and(eq(guestRequests.id,id),eq(guestRequests.orgId,actor.orgId))).limit(1)
 if(!initial)throw new GuestInputError('Request unavailable',404)
 await withStaffGuestBooking(initial.guestProfileId,async(source,_writer,tx)=>{
  const where=and(eq(guestRequests.id,id),eq(guestRequests.orgId,source.orgId),eq(guestRequests.propertyId,source.propertyId),eq(guestRequests.guestProfileId,source.id))
  const [current]=await tx.select().from(guestRequests).where(where).for('update');if(!current)throw new GuestInputError('Request unavailable',404)
  if(current.version!==parsed.data.version)throw new GuestInputError('This request changed. Refresh before updating it.',409)
  const value=parsed.data;assertRequestTransition(current.state as PublicGuestRequest['state'],value.state,value.correctionReason)
  const correction=['completed','declined'].includes(current.state)&&current.state!==value.state
  const [updated]=await tx.update(guestRequests).set({state:value.state,publicReply:value.publicReply??current.publicReply,internalNote:value.internalNote??current.internalNote,version:current.version+1,updatedAt:new Date()}).where(and(where,eq(guestRequests.version,value.version))).returning();if(!updated)throw new GuestInputError('Refresh before updating this request',409)
  await tx.insert(guestRequestEvents).values({orgId:source.orgId,propertyId:source.propertyId,guestProfileId:source.id,requestId:id,actorId:actor.id,kind:correction?'correction':'update',fromState:current.state,toState:value.state,publicReply:value.publicReply??null,internalNote:value.internalNote??null,reason:correction?value.correctionReason:null}).returning()
 })
}
