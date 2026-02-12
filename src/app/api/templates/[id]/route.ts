import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  getTemplateById,
  createTemplate,
  getSubmissions,
  deleteTemplate,
} from '@/lib/db/queries/surveys'
import { db } from '@/lib/db'
import { surveyTemplates } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const questionSchema = z.object({
  text: z.string().min(1),
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
  questions: z.array(questionSchema).min(1),
})

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  weight: z.string().default('1.0'),
  sortOrder: z.number().int().min(0),
  subcategories: z.array(subcategorySchema).min(1),
})

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  categories: z.array(categorySchema).min(1).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/templates/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const template = await getTemplateById(id)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error('GET /api/templates/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/templates/[id]
// If the template has existing submissions, create a new version instead of
// mutating in place. The old template is deactivated and linked via parentId.
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
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

    const existing = await getTemplateById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { name, description, categories } = parsed.data

    // Check if this template has any submissions
    const submissions = await getSubmissions({ propertyId: undefined, status: undefined })
    const hasSubmissions = submissions.some((s) => s.templateId === id)

    if (hasSubmissions && categories) {
      // Template has submissions — create a new version
      // Deactivate the old template
      await db
        .update(surveyTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(surveyTemplates.id, id))

      const newTemplate = await createTemplate({
        template: {
          orgId: profile.orgId,
          name: name ?? existing.name,
          description: description !== undefined ? description : existing.description,
          version: existing.version + 1,
          parentId: id,
          surveyType: existing.surveyType,
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

      return NextResponse.json(newTemplate, { status: 201 })
    }

    // No submissions or no category changes — update in place
    if (name !== undefined || description !== undefined) {
      await db
        .update(surveyTemplates)
        .set({
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          updatedAt: new Date(),
        })
        .where(eq(surveyTemplates.id, id))
    }

    const updated = await getTemplateById(id)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/templates/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/templates/[id]
// ?hard=true -> permanent delete (removes template + categories + questions + submissions)
// default   -> soft delete (set is_active = false)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
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

    const existing = await getTemplateById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const hard = request.nextUrl.searchParams.get('hard') === 'true'

    if (hard) {
      await deleteTemplate(id)
      return NextResponse.json({ success: true, deleted: id })
    }

    await db
      .update(surveyTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(surveyTemplates.id, id))

    return NextResponse.json({ message: 'Template deactivated' })
  } catch (error) {
    console.error('DELETE /api/templates/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    )
  }
}
