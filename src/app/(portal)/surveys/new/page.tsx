import { requireAuth } from '@/lib/auth/guards'
import { getTemplates } from '@/lib/db/queries/surveys'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { NewSurveyWizard } from '@/components/surveys/new-survey-wizard'

export default async function NewSurveyPage() {
  const profile = await requireAuth()

  if (!profile) {
    return null
  }

  const [templates, properties] = await Promise.all([
    getTemplates(profile.orgId),
    getPropertiesForUser(profile.id),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Survey</h1>
        <p className="text-muted-foreground">
          Start a new quality assessment survey.
        </p>
      </div>

      <NewSurveyWizard
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
        }))}
        properties={properties.map((p) => ({
          id: p.id,
          name: p.name,
        }))}
      />
    </div>
  )
}
