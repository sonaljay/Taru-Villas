import { requireRole } from '@/lib/auth/guards'
import { listCategoriesForOrg } from '@/lib/db/queries/categories'
import { SopCategoriesManagement } from '@/components/sops/sop-categories-management'
import { SopsAreaTabs } from '@/components/sops/sops-area-tabs'

export const dynamic = 'force-dynamic'

export default async function SopCategoriesPage() {
  const profile = await requireRole(['admin'])
  const categories = await listCategoriesForOrg(profile.orgId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">SOPs</h1>
      </div>
      <SopsAreaTabs />
      <SopCategoriesManagement initialCategories={categories} />
    </div>
  )
}
