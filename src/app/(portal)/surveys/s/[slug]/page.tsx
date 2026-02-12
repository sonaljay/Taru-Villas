import { notFound, redirect } from 'next/navigation'
import { getSubmissionBySlug } from '@/lib/db/queries/surveys'

interface SlugPageProps {
  params: Promise<{ slug: string }>
}

export default async function SurveySlugPage({ params }: SlugPageProps) {
  const { slug } = await params
  const submission = await getSubmissionBySlug(slug)

  if (!submission) {
    notFound()
  }

  redirect(`/surveys/${submission.id}`)
}
