import { requireRole } from '@/lib/auth/guards'
import { getAllowedEmails } from '@/lib/db/queries/allowed-emails'
import { AllowedEmailsPageClient } from '@/components/admin/allowed-emails-page-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Allowed Emails | Taru Villas',
}

export default async function AllowedEmailsPage() {
  const profile = await requireRole(['admin'])
  if (!profile) return null

  const rawEmails = await getAllowedEmails(profile.orgId)

  const emails = rawEmails.map((e) => ({
    ...e,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  }))

  return <AllowedEmailsPageClient emails={emails} />
}
