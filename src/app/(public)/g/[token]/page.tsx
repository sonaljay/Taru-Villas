import type { Metadata } from 'next'
import { getGuestLinkByToken } from '@/lib/db/queries/guest-links'
import { getTemplateById } from '@/lib/db/queries/surveys'
import { GuestSurveyPage } from '@/components/surveys/guest-survey-page'

interface GuestPageProps {
  params: Promise<{ token: string }>
}

export const metadata: Metadata = {
  title: 'Guest Survey — Taru Villas',
}

export default async function GuestPage({ params }: GuestPageProps) {
  const { token } = await params
  const link = await getGuestLinkByToken(token)

  if (!link || !link.isActive) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Survey Not Available
        </h1>
        <p className="text-muted-foreground max-w-sm">
          This survey link is no longer active or does not exist. Please contact
          the hotel if you believe this is an error.
        </p>
      </div>
    )
  }

  if (!link.templateIsActive || link.templateSurveyType !== 'guest') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Survey Not Available
        </h1>
        <p className="text-muted-foreground max-w-sm">
          This survey is currently unavailable. Please contact the hotel for
          assistance.
        </p>
      </div>
    )
  }

  const template = await getTemplateById(link.templateId)
  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Survey Not Available
        </h1>
        <p className="text-muted-foreground max-w-sm">
          This survey template could not be found.
        </p>
      </div>
    )
  }

  return (
    <GuestSurveyPage
      token={token}
      propertyName={link.propertyName}
      templateName={link.templateName}
      categories={template.categories}
    />
  )
}
