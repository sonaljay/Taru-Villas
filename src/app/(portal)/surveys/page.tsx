export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuth } from '@/lib/auth/guards'
import {
  getSubmissionsWithDetails,
  getSubmissionsForUser,
} from '@/lib/db/queries/surveys'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { SurveyFilters } from '@/components/surveys/survey-filters'
import { CopyLinkButton } from '@/components/surveys/copy-link-button'
import { DeleteSurveyButton } from '@/components/surveys/delete-survey-button'
import { Plus, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'

interface SurveysPageProps {
  searchParams: Promise<{
    propertyId?: string
    status?: string
    dateFrom?: string
    dateTo?: string
    surveyType?: string
  }>
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
    case 'submitted':
      return <Badge variant="default">Submitted</Badge>
    case 'reviewed':
      return (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">
          Reviewed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getSurveyTypeBadge(surveyType: string) {
  return (
    <Badge variant="outline" className="capitalize">
      {surveyType}
    </Badge>
  )
}

export default async function SurveysPage({ searchParams }: SurveysPageProps) {
  const profile = await requireAuth()

  if (!profile) {
    return null
  }

  const params = await searchParams
  const isAdmin = profile.role === 'admin'
  const surveyTypeFilter = (params.surveyType as 'internal' | 'guest') || undefined

  // Fetch submissions based on role
  let submissions: Awaited<ReturnType<typeof getSubmissionsWithDetails>>
  try {
    if (isAdmin) {
      submissions = await getSubmissionsWithDetails({
        propertyId: params.propertyId || undefined,
        status: (params.status as 'draft' | 'submitted' | 'reviewed') || undefined,
        surveyType: surveyTypeFilter,
      })
    } else {
      submissions = await getSubmissionsForUser(profile.id, surveyTypeFilter)
      // Apply client-side filters for non-admin
      if (params.propertyId) {
        submissions = submissions.filter(
          (s) => s.propertyId === params.propertyId
        )
      }
      if (params.status) {
        submissions = submissions.filter((s) => s.status === params.status)
      }
    }
  } catch {
    submissions = []
  }

  // Apply date range filters
  if (params.dateFrom) {
    submissions = submissions.filter((s) => s.visitDate >= params.dateFrom!)
  }
  if (params.dateTo) {
    submissions = submissions.filter((s) => s.visitDate <= params.dateTo!)
  }

  // Get properties for filter dropdown
  let properties: Awaited<ReturnType<typeof getPropertiesForUser>>
  try {
    properties = await getPropertiesForUser(profile.id)
  } catch {
    // Fallback: use assignments from profile (covers dev bypass)
    properties = (profile.assignments ?? []).map((a) => ({
      id: a.propertyId,
      name: a.propertyName,
      code: a.propertyCode,
      slug: a.propertyCode.toLowerCase(),
      orgId: profile.orgId,
      imageUrl: null,
      location: null,
      isActive: a.propertyIsActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Surveys</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'View and manage all quality assessment surveys.'
              : 'View your surveys and property assessments.'}
          </p>
        </div>
        <Button asChild>
          <Link href="/surveys/new">
            <Plus className="size-4" />
            New Survey
          </Link>
        </Button>
      </div>

      <Separator />

      {/* Filters */}
      <SurveyFilters
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        currentPropertyId={params.propertyId}
        currentStatus={params.status}
        currentDateFrom={params.dateFrom}
        currentDateTo={params.dateTo}
        currentSurveyType={params.surveyType}
      />

      {/* Table */}
      {submissions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No surveys found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {params.propertyId || params.status || params.dateFrom || params.dateTo || params.surveyType
                ? 'No surveys match your current filters. Try adjusting them.'
                : 'Start a new quality assessment survey for one of your properties.'}
            </p>
            <Button asChild className="mt-6">
              <Link href="/surveys/new">
                <Plus className="size-4" />
                New Survey
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Visit Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">
                    {submission.propertyName}
                  </TableCell>
                  <TableCell>{submission.templateName}</TableCell>
                  <TableCell>
                    {getSurveyTypeBadge(submission.surveyType ?? 'internal')}
                  </TableCell>
                  <TableCell>
                    {format(new Date(submission.visitDate), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>{getStatusBadge(submission.status)}</TableCell>
                  <TableCell>{submission.submitterName}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {submission.slug && isAdmin && submission.status === 'draft' && (
                        <CopyLinkButton slug={submission.slug} />
                      )}
                      {submission.status === 'draft' &&
                      submission.submittedBy === profile.id ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/surveys/${submission.id}`}>Continue</Link>
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/surveys/${submission.id}`}>View</Link>
                        </Button>
                      )}
                      {(isAdmin || (submission.submittedBy === profile.id && submission.status === 'draft')) && (
                        <DeleteSurveyButton submissionId={submission.id} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
