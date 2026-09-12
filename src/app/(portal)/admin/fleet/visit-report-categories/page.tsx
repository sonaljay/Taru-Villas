import { VisitReportCategoriesClient } from '@/components/fleet/visit-report-categories-client'
import { requireRole } from '@/lib/auth/guards'
import { getVisitReportTaxonomy } from '@/lib/db/queries/visit-report-categories'

export const dynamic = 'force-dynamic'

export default async function VisitReportCategoriesPage() {
  const profile = await requireRole(['admin'])
  const taxonomy = await getVisitReportTaxonomy(profile.orgId)
  return <VisitReportCategoriesClient initialReasons={taxonomy.reasons} initialCategories={taxonomy.categories} />
}
