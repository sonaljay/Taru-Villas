import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guards'
import { getTemplateById } from '@/lib/db/queries/surveys'
import {
  TemplateBuilder,
  type TemplateBuilderData,
} from '@/components/admin/template-builder'

interface EditTemplatePageProps {
  params: Promise<{ templateId: string }>
}

export default async function EditTemplatePage({
  params,
}: EditTemplatePageProps) {
  await requireRole(['admin'])

  const { templateId } = await params
  const template = await getTemplateById(templateId)

  if (!template) {
    notFound()
  }

  const initialData: TemplateBuilderData = {
    id: template.id,
    name: template.name,
    description: template.description,
    version: template.version,
    surveyType: template.surveyType,
    categories: template.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      weight: cat.weight,
      sortOrder: cat.sortOrder,
      subcategories: cat.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        description: sub.description,
        sortOrder: sub.sortOrder,
        questions: sub.questions.map((q) => ({
          id: q.id,
          text: q.text,
          description: q.description,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
          isRequired: q.isRequired,
          sortOrder: q.sortOrder,
        })),
      })),
    })),
  }

  return <TemplateBuilder initialData={initialData} />
}
