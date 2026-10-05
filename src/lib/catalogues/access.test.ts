import { beforeEach,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({property:{id:'property',orgId:'own',isActive:true},assigned:['property'],menu:{id:'menu',propertyId:'property'}}))
vi.mock('@/lib/auth/guards',()=>({getUserProperties:async()=>mocks.assigned}))
vi.mock('@/lib/db',()=>({db:{select:()=>({from:()=>({where:()=>({limit:async()=>mocks.property?[mocks.property]:[]})})})}}))
vi.mock('@/lib/db/queries/menus',()=>({getMenuById:async()=>mocks.menu}))
import { canAccessCatalogueProperty,canAccessCatalogueCategory } from './access'
const admin={id:'admin',orgId:'own',role:'admin',isActive:true}
beforeEach(()=>{mocks.property={id:'property',orgId:'own',isActive:true};mocks.assigned=['property'];mocks.menu={id:'menu',propertyId:'property'}})
it('does not let admins bypass organization or inactive-property isolation',async()=>{expect(await canAccessCatalogueProperty(admin,'property')).toBe(true);mocks.property.orgId='foreign';expect(await canAccessCatalogueProperty(admin,'property')).toBe(false);mocks.property.orgId='own';mocks.property.isActive=false;expect(await canAccessCatalogueProperty(admin,'property')).toBe(false)})
it('requires active assigned managers and denies staff',async()=>{mocks.assigned=[];expect(await canAccessCatalogueProperty({...admin,role:'property_manager'},'property')).toBe(false);expect(await canAccessCatalogueProperty({...admin,isActive:false},'property')).toBe(false);expect(await canAccessCatalogueProperty({...admin,role:'staff'},'property')).toBe(false)})
it('checks category-to-menu property consistency',async()=>{expect(await canAccessCatalogueCategory(admin,{menuId:'menu',propertyId:'property'})).toBe(true);mocks.menu.propertyId='foreign';expect(await canAccessCatalogueCategory(admin,{menuId:'menu',propertyId:'property'})).toBe(false)})
