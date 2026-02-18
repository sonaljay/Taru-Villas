'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Link2,
  UtensilsCrossed,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { MenuCategoryForm } from '@/components/admin/menu-category-form'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { MenuItemCard } from '@/components/admin/menu-item-card'
import type { Property } from '@/lib/db/schema'
import type { MenuCategoryWithItems } from '@/lib/db/queries/menus'

interface MenusPageClientProps {
  property: Property
  categories: MenuCategoryWithItems[]
}

export function MenusPageClient({ property, categories }: MenusPageClientProps) {
  const router = useRouter()
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<MenuCategoryWithItems | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<MenuCategoryWithItems | null>(null)
  const [addItemCategoryId, setAddItemCategoryId] = useState<string | null>(null)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null)

  function copyPublicLink() {
    const url = `${window.location.origin}/m/${property.slug}`
    navigator.clipboard.writeText(url)
    toast.success('Public link copied to clipboard')
  }

  async function handleToggleCategory(cat: MenuCategoryWithItems) {
    setTogglingCategoryId(cat.id)
    try {
      const res = await fetch(`/api/menus/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cat.isActive }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update category')
      }
      toast.success(cat.isActive ? 'Category deactivated' : 'Category activated')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update category'
      )
    } finally {
      setTogglingCategoryId(null)
    }
  }

  async function handleDeleteCategory() {
    if (!deleteCategory) return
    setIsDeletingCategory(true)
    try {
      const res = await fetch(`/api/menus/categories/${deleteCategory.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete category')
      }
      toast.success('Category deleted')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete category'
      )
    } finally {
      setIsDeletingCategory(false)
      setDeleteCategory(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/menus')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
            <p className="text-sm text-muted-foreground">
              Manage the menu for {property.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyPublicLink}>
            <Link2 className="size-4" />
            Copy Public Link
          </Button>
          <Button onClick={() => setCreateCategoryOpen(true)}>
            <Plus className="size-4" />
            Add Category
          </Button>
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 ? (
        <div className="space-y-10">
          {categories.map((cat) => (
            <section key={cat.id}>
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{cat.name}</h2>
                  {!cat.isActive && (
                    <Badge variant="secondary" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7"
                    onClick={() => setEditCategory(cat)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7"
                    onClick={() => handleToggleCategory(cat)}
                    disabled={togglingCategoryId === cat.id}
                  >
                    <Power className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteCategory(cat)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {cat.description && (
                <p className="text-sm text-muted-foreground mb-4">
                  {cat.description}
                </p>
              )}

              {/* Items grid */}
              {cat.menuItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                  {cat.menuItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      categoryId={cat.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No items in this category yet
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setAddItemCategoryId(cat.id)}
              >
                <Plus className="size-4" />
                Add Item
              </Button>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <UtensilsCrossed className="size-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">No menu categories yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get started by adding the first category for this property&apos;s
            menu.
          </p>
          <Button
            onClick={() => setCreateCategoryOpen(true)}
            variant="outline"
            className="mt-4"
          >
            <Plus className="size-4" />
            Add Category
          </Button>
        </div>
      )}

      {/* Create Category Dialog */}
      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>
              Create a new menu category for {property.name}.
            </DialogDescription>
          </DialogHeader>
          <MenuCategoryForm
            propertyId={property.id}
            onSuccess={() => setCreateCategoryOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog
        open={!!editCategory}
        onOpenChange={(open) => !open && setEditCategory(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the details for {editCategory?.name}.
            </DialogDescription>
          </DialogHeader>
          {editCategory && (
            <MenuCategoryForm
              propertyId={property.id}
              category={editCategory}
              onSuccess={() => setEditCategory(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Category Alert */}
      <AlertDialog
        open={!!deleteCategory}
        onOpenChange={(open) => !open && setDeleteCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">
                {deleteCategory?.name}
              </span>
              ? All items in this category will also be deleted. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteCategory}
              disabled={isDeletingCategory}
            >
              {isDeletingCategory ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Item Dialog */}
      <Dialog
        open={!!addItemCategoryId}
        onOpenChange={(open) => !open && setAddItemCategoryId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
            <DialogDescription>
              Add a new item to this category.
            </DialogDescription>
          </DialogHeader>
          {addItemCategoryId && (
            <MenuItemForm
              categoryId={addItemCategoryId}
              onSuccess={() => setAddItemCategoryId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
