import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getSubmissionById, getTemplateById } from '@/lib/db/queries/surveys'
import { getPropertyById } from '@/lib/db/queries/properties'
import { getProfileById } from '@/lib/db/queries/profiles'
import { SurveyForm } from '@/components/surveys/survey-form'
import { SurveyScoreDisplay } from '@/components/surveys/survey-score-display'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

interface SurveyDetailPageProps {
  params: Promise<{ submissionId: string }>
}

export default async function SurveyDetailPage({
  params,
}: SurveyDetailPageProps) {
  const profile = await requireAuth()
  if (!profile) return null

  const { submissionId } = await params
  const submission = await getSubmissionById(submissionId)

  if (!submission) {
    notFound()
  }

  const [template, property, submitter] = await Promise.all([
    getTemplateById(submission.templateId),
    getPropertyById(submission.propertyId),
    getProfileById(submission.submittedBy),
  ])

  if (!template || !property) {
    notFound()
  }

  const isDraft = submission.status === 'draft'
  const isSubmitter = submission.submittedBy === profile.id
  const canEdit = isDraft && isSubmitter

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/surveys">
            <ArrowLeft className="size-4" />
            Back to Surveys
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {property.name} Assessment
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span>Template: {template.name}</span>
            <span>|</span>
            <span>
              Visit: {format(new Date(submission.visitDate), 'MMM d, yyyy')}
            </span>
            <span>|</span>
            <span>By: {submitter?.fullName ?? 'Unknown'}</span>
          </div>
        </div>
        <Badge
          variant={
            submission.status === 'draft'
              ? 'secondary'
              : submission.status === 'submitted'
                ? 'default'
                : 'outline'
          }
          className={
            submission.status === 'reviewed'
              ? 'bg-emerald-600 text-white'
              : undefined
          }
        >
          {submission.status.charAt(0).toUpperCase() +
            submission.status.slice(1)}
        </Badge>
      </div>

      {/* Content */}
      {canEdit ? (
        <SurveyForm
          templateId={submission.templateId}
          propertyId={submission.propertyId}
          visitDate={submission.visitDate}
          categories={template.categories}
          submissionId={submission.id}
          existingResponses={submission.responses.map((r) => ({
            questionId: r.questionId,
            score: r.score,
            note: r.note,
          }))}
        />
      ) : (
        <SurveyScoreDisplay
          categories={template.categories}
          responses={submission.responses}
        />
      )}
    </div>
  )
}
