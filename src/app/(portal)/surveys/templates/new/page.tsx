import { requireRole } from '@/lib/auth/guards'
import { TemplateBuilder } from '@/components/admin/template-builder'

export default async function NewTemplatePage() {
  await requireRole(['admin'])

  return <TemplateBuilder />
}
