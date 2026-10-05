import { beforeEach,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({allowed:false,role:'admin',menus:vi.fn(async()=>[]),excursions:vi.fn(async()=>[])}))
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('Not found')}}))
vi.mock('@/lib/auth/guards',()=>({requireRole:async()=>({id:'actor',orgId:'own',role:mocks.role,isActive:true}),getUserProperties:async()=>null}))
vi.mock('@/lib/catalogues/access',()=>({canAccessCatalogueProperty:async()=>mocks.allowed}))
vi.mock('@/lib/db/queries/properties',()=>({getPropertyById:async()=>({id:'foreign',orgId:'foreign',isActive:true})}))
vi.mock('@/lib/db/queries/menus',()=>({getMenusForProperty:mocks.menus}))
vi.mock('@/lib/db/queries/excursions',()=>({getExcursionsForProperty:mocks.excursions}))
import MenusPage from '@/app/(portal)/properties/[propertyId]/menus/page'
import ExcursionsPage from '@/app/(portal)/properties/[propertyId]/excursions/page'
beforeEach(()=>{mocks.allowed=false;vi.clearAllMocks()})
it.each(['admin','property_manager'])('blocks foreign or unassigned %s page reads before catalogue queries',async role=>{mocks.role=role;for(const page of [MenusPage,ExcursionsPage])await expect(page({params:Promise.resolve({propertyId:'foreign'})})).rejects.toThrow('Not found');expect(mocks.menus).not.toHaveBeenCalled();expect(mocks.excursions).not.toHaveBeenCalled()})
