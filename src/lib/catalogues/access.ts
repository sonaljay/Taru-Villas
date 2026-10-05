import { and,eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties } from '@/lib/db/schema'
import { getUserProperties } from '@/lib/auth/guards'
import { getMenuById } from '@/lib/db/queries/menus'
type Actor={id:string;orgId:string;role:string;isActive:boolean}
export async function canAccessCatalogueProperty(actor:Actor,propertyId:string):Promise<boolean>{
 if(!actor.isActive||!['admin','property_manager'].includes(actor.role))return false
 const [property]=await db.select({id:properties.id,orgId:properties.orgId,isActive:properties.isActive}).from(properties).where(and(eq(properties.id,propertyId),eq(properties.orgId,actor.orgId),eq(properties.isActive,true))).limit(1)
 if(!property||property.orgId!==actor.orgId||!property.isActive)return false
 if(actor.role==='admin')return true
 const assigned=await getUserProperties(actor.id,'property_manager')
 return !!assigned?.includes(propertyId)
}
export async function canAccessCatalogueCategory(actor:Actor,category:{propertyId:string;menuId:string}){
 const menu=await getMenuById(category.menuId)
 return !!menu&&menu.propertyId===category.propertyId&&await canAccessCatalogueProperty(actor,menu.propertyId)
}
