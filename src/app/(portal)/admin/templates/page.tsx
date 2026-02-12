import Link from 'next/link'
import { requireRole } from '@/lib/auth/guards'
import { getTemplatesWithCounts } from '@/lib/db/queries/surveys'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TemplateActions } from '@/components/admin/template-actions'
import { Plus, FileText } from 'lucide-react'

export default async function TemplatesPage() {
  const profile = await requireRole(['admin'])

  const templates = await getTemplatesWithCounts(profile.orgId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Survey Templates
          </h1>
          <p className="text-muted-foreground">
            Create and manage survey templates for quality assessments.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/templates/new">
            <Plus className="size-4" />
            Create Template
          </Link>
        </Button>
      </div>

      <Separator />

      {/* Templates grid */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No templates yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create your first survey template to start collecting quality
              assessment data from your properties.
            </p>
            <Button asChild className="mt-6">
              <Link href="/admin/templates/new">
                <Plus className="size-4" />
                Create Template
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="truncate">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="line-clamp-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </div>
                  <TemplateActions templateId={template.id} isActive={template.isActive} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{template.version}</p>
                    <p className="text-xs text-muted-foreground">Version</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {template.categoryCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Categories</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {template.questionCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Questions</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t pt-4">
                <div className="flex items-center gap-2">
                  <Badge variant={template.isActive ? 'default' : 'secondary'}>
                    {template.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {template.surveyType}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/templates/${template.id}`}>Edit</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
