'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Link2, UtensilsCrossed, Pencil, Power, Trash2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { MenuCategoryForm } from '@/components/admin/menu-category-form'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { MenuItemCard } from '@/components/admin/menu-item-card'
import { MenuMetaForm } from '@/components/admin/menu-meta-form'
import { CoverImageInput } from '@/components/admin/cover-image-input'
import type { Property } from '@/lib/db/schema'
import type { MenuWithCategories, MenuCategoryWithItems } from '@/lib/db/queries/menus'

interface MenusPageClientProps {
  property: Property
  menus: MenuWithCategories[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon..Sun

const SET_INTRO =
  "At The Long House, our food reflects the Southern coastline — bold, vibrant, and rooted in tradition. These are today's set menu selections. Should you wish to order à la carte, our Seven to Seven menu is available as well."
const SET_FOOTER =
  'Includes a selection of tea, coffee & petit fours. All prices are inclusive of government taxes & service charges.'

export function MenusPageClient({ property, menus }: MenusPageClientProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'set' | 'alacarte'>('set')
  const [selectedDow, setSelectedDow] = useState<number>(1) // Monday
  const [busy, setBusy] = useState(false)

  // dialogs
  const [metaMenu, setMetaMenu] = useState<MenuWithCategories | null>(null)
  const [createCatMenuId, setCreateCatMenuId] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState<MenuCategoryWithItems | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<MenuCategoryWithItems | null>(null)
  const [addItemCategoryId, setAddItemCategoryId] = useState<string | null>(null)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null)

  const setMenus = menus.filter((m) => m.type === 'set')
  const aLaCarte = menus.find((m) => m.type === 'a_la_carte') ?? null
  const activeSet = setMenus.find((m) => m.dayOfWeek === selectedDow) ?? null
  const current = tab === 'set' ? activeSet : aLaCarte

  function copyPublicLink() {
    navigator.clipboard.writeText(`${window.location.origin}/m/${property.slug}`)
    toast.success('Public link copied to clipboard')
  }

  async function createMenu(payload: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch('/api/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property.id, ...payload }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to create menu')
      }
      toast.success('Menu created')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create menu')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleCategory(cat: MenuCategoryWithItems) {
    setTogglingCategoryId(cat.id)
    try {
      const res = await fetch(`/api/menus/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cat.isActive }),
      })
      if (!res.ok) throw new Error('Failed to update category')
      toast.success(cat.isActive ? 'Section deactivated' : 'Section activated')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update section')
    } finally {
      setTogglingCategoryId(null)
    }
  }

  async function handleDeleteCategory() {
    if (!deleteCategory) return
    setIsDeletingCategory(true)
    try {
      const res = await fetch(`/api/menus/categories/${deleteCategory.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete section')
      toast.success('Section deleted')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete section')
    } finally {
      setIsDeletingCategory(false)
      setDeleteCategory(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/menus')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
            <p className="text-sm text-muted-foreground">Manage the menu for {property.name}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyPublicLink}>
          <Link2 className="size-4" /> Copy Public Link
        </Button>
      </div>

      <CoverImageInput
        propertyId={property.id}
        fieldName="menuCoverImageUrl"
        currentUrl={property.menuCoverImageUrl}
        label="Menu Cover Image"
      />

      {/* Class switcher */}
      <div className="flex gap-2 border-b">
        {(['set', 'alacarte'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'set' ? 'Set Menu' : 'Seven to Seven'}
          </button>
        ))}
      </div>

      {/* Set-menu day selector */}
      {tab === 'set' && (
        <div className="flex flex-wrap gap-2">
          {DAY_ORDER.map((dow) => {
            const exists = setMenus.some((m) => m.dayOfWeek === dow)
            return (
              <button
                key={dow}
                onClick={() => setSelectedDow(dow)}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  selectedDow === dow ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                } ${exists ? '' : 'opacity-50'}`}
              >
                {DAY_NAMES[dow]}
              </button>
            )
          })}
        </div>
      )}

      {/* Current menu body */}
      {current ? (
        <div className="space-y-8">
          {/* Menu meta bar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
            <div>
              <p className="font-medium">{current.name}</p>
              {current.priceNote && <p className="text-sm text-muted-foreground">{current.priceNote}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMetaMenu(current)}>
                <Settings2 className="size-4" /> Edit Details
              </Button>
              <Button size="sm" onClick={() => setCreateCatMenuId(current.id)}>
                <Plus className="size-4" /> Add Section
              </Button>
            </div>
          </div>

          {current.categories.length > 0 ? (
            current.categories.map((cat) => (
              <section key={cat.id}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold">{cat.name}</h2>
                    {cat.priceNote && <Badge variant="outline" className="text-[10px]">{cat.priceNote}</Badge>}
                    {!cat.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" className="size-7" onClick={() => setEditCategory(cat)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="size-7" onClick={() => handleToggleCategory(cat)} disabled={togglingCategoryId === cat.id}>
                      <Power className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteCategory(cat)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {cat.description && <p className="mb-4 text-sm text-muted-foreground">{cat.description}</p>}
                {cat.menuItems.length > 0 ? (
                  <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                    {cat.menuItems.map((item) => (
                      <MenuItemCard key={item.id} item={item} categoryId={cat.id} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed py-8 text-center">
                    <p className="text-sm text-muted-foreground">No items in this section yet</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddItemCategoryId(cat.id)}>
                  <Plus className="size-4" /> Add Item
                </Button>
              </section>
            ))
          ) : (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">No sections yet. Add the first one.</p>
            </div>
          )}
        </div>
      ) : (
        // No menu for this slot — offer to create
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <UtensilsCrossed className="size-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">
            {tab === 'set' ? `No set menu for ${DAY_NAMES[selectedDow]}` : 'No à la carte menu yet'}
          </h3>
          <Button
            variant="outline"
            className="mt-4"
            disabled={busy}
            onClick={() =>
              tab === 'set'
                ? createMenu({ type: 'set', dayOfWeek: selectedDow, name: DAY_NAMES[selectedDow], priceNote: '$40 per person', description: SET_INTRO, footerNote: SET_FOOTER })
                : createMenu({ type: 'a_la_carte', name: 'Seven to Seven', footerNote: 'Prices are inclusive of service charge & applicable taxes.' })
            }
          >
            <Plus className="size-4" />
            {tab === 'set' ? `Create ${DAY_NAMES[selectedDow]} set menu` : 'Create Seven to Seven menu'}
          </Button>
        </div>
      )}

      {/* Edit meta dialog */}
      <Dialog open={!!metaMenu} onOpenChange={(o) => !o && setMetaMenu(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Menu Details</DialogTitle>
            <DialogDescription>Edit the heading, pricing and notes for this menu.</DialogDescription>
          </DialogHeader>
          {metaMenu && <MenuMetaForm menu={metaMenu} onSuccess={() => setMetaMenu(null)} />}
        </DialogContent>
      </Dialog>

      {/* Create section dialog */}
      <Dialog open={!!createCatMenuId} onOpenChange={(o) => !o && setCreateCatMenuId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
            <DialogDescription>Create a new section for this menu.</DialogDescription>
          </DialogHeader>
          {createCatMenuId && (
            <MenuCategoryForm propertyId={property.id} menuId={createCatMenuId} onSuccess={() => setCreateCatMenuId(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit section dialog */}
      <Dialog open={!!editCategory} onOpenChange={(o) => !o && setEditCategory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>Update the details for {editCategory?.name}.</DialogDescription>
          </DialogHeader>
          {editCategory && (
            <MenuCategoryForm propertyId={property.id} menuId={editCategory.menuId} category={editCategory} onSuccess={() => setEditCategory(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete section alert */}
      <AlertDialog open={!!deleteCategory} onOpenChange={(o) => !o && setDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">{deleteCategory?.name}</span> and all its items? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteCategory} disabled={isDeletingCategory}>
              {isDeletingCategory ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add item dialog */}
      <Dialog open={!!addItemCategoryId} onOpenChange={(o) => !o && setAddItemCategoryId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
            <DialogDescription>Add a new item to this section.</DialogDescription>
          </DialogHeader>
          {addItemCategoryId && <MenuItemForm categoryId={addItemCategoryId} onSuccess={() => setAddItemCategoryId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
