import { notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getIssueById } from '@/lib/db/queries/issues'
import { IssueDetail } from '@/components/issues/issue-detail'

export const dynamic = 'force-dynamic'

interface IssueDetailPageProps {
  params: Promise<{ issueId: string }>
}

export default async function IssueDetailPage({ params }: IssueDetailPageProps) {
  const profile = await requireRole(['admin', 'property_manager'])
  const { issueId } = await params

  const issue = await getIssueById(issueId)
  if (!issue) {
    notFound()
  }

  // PMs can only see issues for their assigned properties
  if (profile.role !== 'admin') {
    const userProps = await getUserProperties(profile.id, profile.role as 'property_manager')
    if (userProps && !userProps.includes(issue.propertyId)) {
      notFound()
    }
  }

  return <IssueDetail issue={issue} backHref="/issues" />
}
