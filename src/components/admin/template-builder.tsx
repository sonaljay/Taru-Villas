'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
  Save,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const questionFormSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, 'Question text is required'),
  description: z.string().optional(),
  scaleMin: z.number().int().min(0).default(1),
  scaleMax: z.number().int().min(1).default(10),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0),
})

const categoryFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  weight: z.string().default('1.0'),
  sortOrder: z.number().int().min(0),
  questions: z
    .array(questionFormSchema)
    .min(1, 'Each category must have at least one question'),
})

const templateFormSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(255),
  description: z.string().max(1000).optional(),
  categories: z
    .array(categoryFormSchema)
    .min(1, 'At least one category is required'),
})

type TemplateFormValues = z.infer<typeof templateFormSchema>

// ---------------------------------------------------------------------------
// Types for initial data
// ---------------------------------------------------------------------------

interface TemplateQuestion {
  id: string
  text: string
  description: string | null
  scaleMin: number
  scaleMax: number
  isRequired: boolean
  sortOrder: number
}

interface TemplateCategory {
  id: string
  name: string
  description: string | null
  weight: string
  sortOrder: number
  questions: TemplateQuestion[]
}

export interface TemplateBuilderData {
  id?: string
  name: string
  description: string | null
  version: number
  categories: TemplateCategory[]
}

interface TemplateBuilderProps {
  initialData?: TemplateBuilderData
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateBuilder({ initialData }: TemplateBuilderProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<number>>(
    new Set()
  )

  const isEditing = !!initialData?.id

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<TemplateFormValues>({
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      categories:
        initialData?.categories.map((cat, ci) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description ?? '',
          weight: cat.weight,
          sortOrder: ci,
          questions: cat.questions.map((q, qi) => ({
            id: q.id,
            text: q.text,
            description: q.description ?? '',
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            isRequired: q.isRequired,
            sortOrder: qi,
          })),
        })) ?? [],
    },
  })

  const {
    fields: categoryFields,
    append: appendCategory,
    remove: removeCategory,
    move: moveCategory,
  } = useFieldArray({
    control,
    name: 'categories',
  })

  function toggleCategoryCollapse(index: number) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function addCategory() {
    appendCategory({
      name: '',
      description: '',
      weight: '1.0',
      sortOrder: categoryFields.length,
      questions: [
        {
          text: '',
          description: '',
          scaleMin: 1,
          scaleMax: 10,
          isRequired: true,
          sortOrder: 0,
        },
      ],
    })
  }

  async function onSubmit(data: TemplateFormValues) {
    // Client-side validation with zod
    const result = templateFormSchema.safeParse(data)
    if (!result.success) {
      const firstError = result.error.issues[0]
      toast.error(firstError?.message ?? 'Validation failed')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        categories: data.categories.map((cat, ci) => ({
          name: cat.name,
          description: cat.description || undefined,
          weight: cat.weight || '1.0',
          sortOrder: ci,
          questions: cat.questions.map((q, qi) => ({
            text: q.text,
            description: q.description || undefined,
            scaleMin: Number(q.scaleMin) || 1,
            scaleMax: Number(q.scaleMax) || 10,
            isRequired: q.isRequired,
            sortOrder: qi,
          })),
        })),
      }

      const url = isEditing
        ? `/api/templates/${initialData.id}`
        : '/api/templates'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Something went wrong')
      }

      toast.success(
        isEditing ? 'Template updated successfully' : 'Template created successfully'
      )
      router.push('/admin/templates')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save template'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEditing ? 'Edit Template' : 'Create Template'}
          </h1>
          {isEditing && initialData?.version && (
            <p className="text-sm text-muted-foreground">
              Version {initialData.version}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/templates')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            <Save className="size-4" />
            {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* Template info */}
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
          <CardDescription>
            Set the name and description for this survey template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g. Monthly Quality Assessment"
              {...register('name', { required: 'Template name is required' })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the purpose of this template..."
              rows={3}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Categories</h2>
            <p className="text-sm text-muted-foreground">
              Organize your survey questions into categories. Each category can
              have a weight that affects the overall score.
            </p>
          </div>
        </div>

        {errors.categories?.message && (
          <p className="text-sm text-destructive">{errors.categories.message}</p>
        )}

        {categoryFields.map((categoryField, categoryIndex) => (
          <CategorySection
            key={categoryField.id}
            categoryIndex={categoryIndex}
            control={control}
            register={register}
            errors={errors}
            isCollapsed={collapsedCategories.has(categoryIndex)}
            onToggleCollapse={() => toggleCategoryCollapse(categoryIndex)}
            onMoveUp={
              categoryIndex > 0
                ? () => moveCategory(categoryIndex, categoryIndex - 1)
                : undefined
            }
            onMoveDown={
              categoryIndex < categoryFields.length - 1
                ? () => moveCategory(categoryIndex, categoryIndex + 1)
                : undefined
            }
            onRemove={
              categoryFields.length > 1
                ? () => removeCategory(categoryIndex)
                : undefined
            }
            watch={watch}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addCategory}
          className="w-full border-dashed"
        >
          <Plus className="size-4" />
          Add Category
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Category section sub-component
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  categoryIndex: number
  control: ReturnType<typeof useForm<TemplateFormValues>>['control']
  register: ReturnType<typeof useForm<TemplateFormValues>>['register']
  errors: ReturnType<typeof useForm<TemplateFormValues>>['formState']['errors']
  isCollapsed: boolean
  onToggleCollapse: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRemove?: () => void
  watch: ReturnType<typeof useForm<TemplateFormValues>>['watch']
}

function CategorySection({
  categoryIndex,
  control,
  register,
  errors,
  isCollapsed,
  onToggleCollapse,
  onMoveUp,
  onMoveDown,
  onRemove,
  watch,
}: CategorySectionProps) {
  const {
    fields: questionFields,
    append: appendQuestion,
    remove: removeQuestion,
    move: moveQuestion,
  } = useFieldArray({
    control,
    name: `categories.${categoryIndex}.questions`,
  })

  const categoryErrors = errors.categories?.[categoryIndex]
  const categoryName = watch(`categories.${categoryIndex}.name`)

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            {onMoveUp && (
              <button
                type="button"
                onClick={onMoveUp}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ChevronUp className="size-3.5" />
              </button>
            )}
            {onMoveDown && (
              <button
                type="button"
                onClick={onMoveDown}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ChevronDown className="size-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex flex-1 items-center gap-2 text-left"
          >
            {isCollapsed ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="size-4 text-muted-foreground" />
            )}
            <span className="font-semibold">
              {categoryName || `Category ${categoryIndex + 1}`}
            </span>
            <span className="text-sm text-muted-foreground">
              ({questionFields.length}{' '}
              {questionFields.length === 1 ? 'question' : 'questions'})
            </span>
          </button>

          {onRemove && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Category</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this category and all its
                    questions? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onRemove}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-6">
          {/* Category fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input
                placeholder="e.g. Cleanliness"
                {...register(`categories.${categoryIndex}.name`, {
                  required: 'Category name is required',
                })}
              />
              {categoryErrors?.name && (
                <p className="text-sm text-destructive">
                  {categoryErrors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Weight</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="1.0"
                {...register(`categories.${categoryIndex}.weight`)}
              />
              <p className="text-xs text-muted-foreground">
                Higher weights count more toward the overall score
              </p>
            </div>
          </div>

          <Separator />

          {/* Questions */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Questions
            </h3>

            {categoryErrors?.questions?.message && (
              <p className="text-sm text-destructive">
                {categoryErrors.questions.message}
              </p>
            )}

            {questionFields.map((questionField, questionIndex) => (
              <QuestionRow
                key={questionField.id}
                categoryIndex={categoryIndex}
                questionIndex={questionIndex}
                control={control}
                register={register}
                errors={errors}
                onMoveUp={
                  questionIndex > 0
                    ? () => moveQuestion(questionIndex, questionIndex - 1)
                    : undefined
                }
                onMoveDown={
                  questionIndex < questionFields.length - 1
                    ? () => moveQuestion(questionIndex, questionIndex + 1)
                    : undefined
                }
                onRemove={
                  questionFields.length > 1
                    ? () => removeQuestion(questionIndex)
                    : undefined
                }
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                appendQuestion({
                  text: '',
                  description: '',
                  scaleMin: 1,
                  scaleMax: 10,
                  isRequired: true,
                  sortOrder: questionFields.length,
                })
              }
            >
              <Plus className="size-4" />
              Add Question
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Question row sub-component
// ---------------------------------------------------------------------------

interface QuestionRowProps {
  categoryIndex: number
  questionIndex: number
  control: ReturnType<typeof useForm<TemplateFormValues>>['control']
  register: ReturnType<typeof useForm<TemplateFormValues>>['register']
  errors: ReturnType<typeof useForm<TemplateFormValues>>['formState']['errors']
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRemove?: () => void
}

function QuestionRow({
  categoryIndex,
  questionIndex,
  control,
  register,
  errors,
  onMoveUp,
  onMoveDown,
  onRemove,
}: QuestionRowProps) {
  const prefix =
    `categories.${categoryIndex}.questions.${questionIndex}` as const
  const questionErrors =
    errors.categories?.[categoryIndex]?.questions?.[questionIndex]

  return (
    <div className="group relative rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        {/* Sort controls */}
        <div className="flex flex-col gap-0.5 pt-2">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <ChevronUp className="size-3.5" />
            </button>
          )}
          <GripVertical className="size-3.5 text-muted-foreground/50" />
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <ChevronDown className="size-3.5" />
            </button>
          )}
        </div>

        {/* Question content */}
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Question {questionIndex + 1}
            </Label>
            <Textarea
              placeholder="Enter your survey question..."
              rows={2}
              {...register(`${prefix}.text`, {
                required: 'Question text is required',
              })}
            />
            {questionErrors?.text && (
              <p className="text-sm text-destructive">
                {questionErrors.text.message}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Scale Min
              </Label>
              <Input
                type="number"
                className="w-20"
                {...register(`${prefix}.scaleMin`, { valueAsNumber: true })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                Scale Max
              </Label>
              <Input
                type="number"
                className="w-20"
                {...register(`${prefix}.scaleMax`, { valueAsNumber: true })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Required</Label>
              <Controller
                control={control}
                name={`${prefix}.isRequired`}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Delete button */}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  )
}
