'use client'
import type { MenuWithCategories } from '@/lib/db/queries/menus'
import { TraditionalMenuLayout } from '@/components/menus/traditional-menu-layout'
import { Button } from '@/components/ui/button'
import type { GuestRequestInput } from '@/lib/guest-portal/types'
export type RequestSelection = Pick<GuestRequestInput, 'kind' | 'itemId' | 'itemKind'> & { title: string }
export function GuestMenu({ menus, disabled, onRequest }: { menus: MenuWithCategories[]; disabled: boolean; onRequest: (selection: RequestSelection) => void }) {
  if (!menus.length) return <p className="py-8">Our team will share the latest dining options with you.</p>
  return <div className="space-y-10">{menus.map(menu => <article key={menu.id} className="rounded-2xl border border-[#243b32]/15 bg-white px-2 py-8 sm:px-8"><header className="text-center"><h3 className="font-serif text-3xl">{menu.name}</h3>{menu.description && <p className="mx-auto mt-3 max-w-xl text-sm">{menu.description}</p>}{menu.priceNote && <p className="mt-3 whitespace-pre-line text-sm">{menu.priceNote}</p>}</header><TraditionalMenuLayout categories={menu.categories} /><div className="mx-auto max-w-2xl px-4">{menu.type === 'set' ? <Button disabled={disabled} onClick={() => onRequest({ kind: 'dining', itemId: menu.id, itemKind: 'set_menu', title: menu.name })}>Request this menu</Button> : <div className="space-y-3">{menu.categories.flatMap(c => c.menuItems).map(item => <div key={item.id} className="flex items-center justify-between gap-4 border-t py-3"><span className="min-w-0 break-words text-sm">{item.title}</span><Button variant="outline" size="sm" disabled={disabled} onClick={() => onRequest({ kind: 'dining', itemId: item.id, itemKind: 'menu_item', title: item.title })} aria-label={`Request ${item.title}`}>Request</Button></div>)}</div>}{menu.footerNote && <p className="mt-5 whitespace-pre-line text-xs">{menu.footerNote}</p>}</div></article>)}</div>
}
