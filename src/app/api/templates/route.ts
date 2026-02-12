import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTemplates, createTemplate } from '@/lib/db/queries/surveys'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const questionSchema = z.object({
  text: z.string().min(1, 'Question text is required'),
  description: z.string().optional(),
  scaleMin: z.number().int().min(0).default(1),
  scaleMax: z.number().int().min(1).default(10),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0),
})

const subcategorySchema = z.object({
  name: z.string().default(''),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0),
  questions: z.array(questionSchema).min(1, 'Each sub-category must have at least one question'),
})

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  weight: z.string().default('1.0'),
  sortOrder: z.number().int().min(0),
  subcategories: z.array(subcategorySchema).min(1, 'Each category must have at least one sub-category'),
})

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(255),
  description: z.string().max(1000).optional(),
  surveyType: z.enum(['internal', 'guest']).default('internal'),
  categories: z.array(categorySchema).min(1, 'At least one category is required'),
})

// ---------------------------------------------------------------------------
// GET /api/templates
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const surveyType = searchParams.get('surveyType') as 'internal' | 'guest' | null

    const templates = await getTemplates(
      profile.orgId,
      surveyType || undefined
    )

    return NextResponse.json(templates)
  } catch (error) {
    console.error('GET /api/templates error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/templates
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { name, description, surveyType, categories } = parsed.data

    const template = await createTemplate({
      template: {
        orgId: profile.orgId,
        name,
        description: description ?? null,
        surveyType,
        createdBy: profile.id,
      },
      categories: categories.map((cat) => ({
        name: cat.name,
        description: cat.description ?? null,
        weight: cat.weight,
        sortOrder: cat.sortOrder,
        subcategories: cat.subcategories.map((sub) => ({
          name: sub.name,
          description: sub.description ?? null,
          sortOrder: sub.sortOrder,
          questions: sub.questions.map((q) => ({
            text: q.text,
            description: q.description ?? null,
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            isRequired: q.isRequired,
            sortOrder: q.sortOrder,
          })),
        })),
      })),
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('POST /api/templates error:', error)
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    )
  }
}
