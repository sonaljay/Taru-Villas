import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { StructuredVisitReport } from '@/components/fleet/structured-visit-report'

export const dynamic = 'force-dynamic'

export default async function VisitReportPage({ params }: { params: Promise<{ requestId: string }> }) {
  const profile = await requireAuth()
  if (!profile) redirect('/login?error=no_profile')
  if (!profile.isActive) redirect('/login?error=inactive')
  const { requestId } = await params
  return <StructuredVisitReport requestId={requestId} />
}
