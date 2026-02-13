import { eq, and, desc, sql, like } from 'drizzle-orm'
import { db } from '..'
import {
  surveyTemplates,
  surveyCategories,
  surveySubcategories,
  surveyQuestions,
  surveySubmissions,
  surveyResponses,
  properties,
  profiles,
  propertyAssignments,
  guestSurveyLinks,
  type SurveyTemplate,
  type NewSurveyTemplate,
  type SurveySubmission,
  type NewSurveySubmission,
  type NewSurveyCategory,
  type NewSurveySubcategory,
  type NewSurveyQuestion,
  type NewSurveyResponse,
} from '../schema'

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Get all active survey templates for an organization.
 */
export async function getTemplates(
  orgId: string,
  surveyType?: 'internal' | 'guest'
): Promise<SurveyTemplate[]> {
  const conditions = [
    eq(surveyTemplates.orgId, orgId),
    eq(surveyTemplates.isActive, true),
  ]
  if (surveyType) {
    conditions.push(eq(surveyTemplates.surveyType, surveyType))
  }

  return db
    .select()
    .from(surveyTemplates)
    .where(and(...conditions))
    .orderBy(desc(surveyTemplates.createdAt))
}

/**
 * Get all survey templates for an organization (including inactive).
 * Used in the admin templates list.
 */
export async function getAllTemplates(
  orgId: string,
  surveyType?: 'internal' | 'guest'
): Promise<SurveyTemplate[]> {
  const conditions = [eq(surveyTemplates.orgId, orgId)]
  if (surveyType) {
    conditions.push(eq(surveyTemplates.surveyType, surveyType))
  }

  return db
    .select()
    .from(surveyTemplates)
    .where(and(...conditions))
    .orderBy(desc(surveyTemplates.createdAt))
}

/**
 * Get templates with their category, subcategory, and question counts for listing.
 */
export async function getTemplatesWithCounts(
  orgId: string,
  surveyType?: 'internal' | 'guest'
) {
  const templates = await getAllTemplates(orgId, surveyType)

  const templateIds = templates.map((t) => t.id)
  if (templateIds.length === 0) return []

  const categories = await db
    .select()
    .from(surveyCategories)
    .where(sql`${surveyCategories.templateId} IN ${templateIds}`)

  const categoryIds = categories.map((c) => c.id)
  let subcategories: { id: string; categoryId: string }[] = []
  if (categoryIds.length > 0) {
    subcategories = await db
      .select({ id: surveySubcategories.id, categoryId: surveySubcategories.categoryId })
      .from(surveySubcategories)
      .where(sql`${surveySubcategories.categoryId} IN ${categoryIds}`)
  }

  const subcategoryIds = subcategories.map((s) => s.id)
  let questions: { subcategoryId: string }[] = []
  if (subcategoryIds.length > 0) {
    questions = await db
      .select({ subcategoryId: surveyQuestions.subcategoryId })
      .from(surveyQuestions)
      .where(sql`${surveyQuestions.subcategoryId} IN ${subcategoryIds}`)
  }

  // Build lookup maps
  const categoriesByTemplate = new Map<string, typeof categories>()
  for (const cat of categories) {
    const existing = categoriesByTemplate.get(cat.templateId) ?? []
    existing.push(cat)
    categoriesByTemplate.set(cat.templateId, existing)
  }

  const subcategoriesByCategory = new Map<string, number>()
  for (const sub of subcategories) {
    subcategoriesByCategory.set(
      sub.categoryId,
      (subcategoriesByCategory.get(sub.categoryId) ?? 0) + 1
    )
  }

  const questionsBySubcategory = new Map<string, number>()
  for (const q of questions) {
    questionsBySubcategory.set(
      q.subcategoryId,
      (questionsBySubcategory.get(q.subcategoryId) ?? 0) + 1
    )
  }

  // Build subcategory-to-category map for question counting
  const subcatToCat = new Map<string, string>()
  for (const sub of subcategories) {
    subcatToCat.set(sub.id, sub.categoryId)
  }

  return templates.map((template) => {
    const templateCategories = categoriesByTemplate.get(template.id) ?? []
    const catIds = new Set(templateCategories.map((c) => c.id))

    let subcategoryCount = 0
    let questionCount = 0

    for (const sub of subcategories) {
      if (catIds.has(sub.categoryId)) {
        subcategoryCount++
        questionCount += questionsBySubcategory.get(sub.id) ?? 0
      }
    }

    return {
      ...template,
      categoryCount: templateCategories.length,
      subcategoryCount,
      questionCount,
    }
  })
}

/**
 * Get a template by ID including its categories, subcategories, and questions.
 * Returns a 3-level hierarchy: categories[].subcategories[].questions[]
 */
export async function getTemplateById(id: string) {
  const template = await db
    .select()
    .from(surveyTemplates)
    .where(eq(surveyTemplates.id, id))
    .limit(1)

  if (!template[0]) return null

  const categories = await db
    .select()
    .from(surveyCategories)
    .where(eq(surveyCategories.templateId, id))
    .orderBy(surveyCategories.sortOrder)

  const categoryIds = categories.map((c) => c.id)

  let subcategoriesAll: (typeof surveySubcategories.$inferSelect)[] = []
  if (categoryIds.length > 0) {
    subcategoriesAll = await db
      .select()
      .from(surveySubcategories)
      .where(sql`${surveySubcategories.categoryId} IN ${categoryIds}`)
      .orderBy(surveySubcategories.sortOrder)
  }

  const subcategoryIds = subcategoriesAll.map((s) => s.id)

  let questions: (typeof surveyQuestions.$inferSelect)[] = []
  if (subcategoryIds.length > 0) {
    questions = await db
      .select()
      .from(surveyQuestions)
      .where(sql`${surveyQuestions.subcategoryId} IN ${subcategoryIds}`)
      .orderBy(surveyQuestions.sortOrder)
  }

  // Group questions under subcategories, subcategories under categories
  const categoriesWithHierarchy = categories.map((category) => {
    const catSubcategories = subcategoriesAll
      .filter((s) => s.categoryId === category.id)
      .map((subcategory) => ({
        ...subcategory,
        questions: questions.filter((q) => q.subcategoryId === subcategory.id),
      }))

    return {
      ...category,
      subcategories: catSubcategories,
    }
  })

  return {
    ...template[0],
    categories: categoriesWithHierarchy,
  }
}

/**
 * Create a new template with its categories, subcategories, and questions in a transaction.
 * Accepts a 3-level hierarchy: categories[].subcategories[].questions[]
 */
export async function createTemplate(data: {
  template: NewSurveyTemplate
  categories: (Omit<NewSurveyCategory, 'templateId'> & {
    subcategories: (Omit<NewSurveySubcategory, 'categoryId'> & {
      questions: Omit<NewSurveyQuestion, 'subcategoryId'>[]
    })[]
  })[]
}) {
  return db.transaction(async (tx) => {
    // Insert template
    const [template] = await tx
      .insert(surveyTemplates)
      .values(data.template)
      .returning()

    // Insert each category, its subcategories, and their questions
    for (const categoryData of data.categories) {
      const { subcategories, ...categoryFields } = categoryData

      const [category] = await tx
        .insert(surveyCategories)
        .values({ ...categoryFields, templateId: template.id })
        .returning()

      for (const subcategoryData of subcategories) {
        const { questions, ...subcategoryFields } = subcategoryData

        const [subcategory] = await tx
          .insert(surveySubcategories)
          .values({ ...subcategoryFields, categoryId: category.id })
          .returning()

        if (questions.length > 0) {
          await tx.insert(surveyQuestions).values(
            questions.map((q) => ({
              ...q,
              subcategoryId: subcategory.id,
            }))
          )
        }
      }
    }

    return template
  })
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export interface SubmissionFilters {
  propertyId?: string
  userId?: string
  status?: 'draft' | 'submitted' | 'reviewed'
  surveyType?: 'internal' | 'guest'
}

/**
 * Get a filtered list of survey submissions.
 */
export async function getSubmissions(
  filters: SubmissionFilters = {}
): Promise<SurveySubmission[]> {
  const conditions = []

  if (filters.propertyId) {
    conditions.push(eq(surveySubmissions.propertyId, filters.propertyId))
  }
  if (filters.userId) {
    conditions.push(eq(surveySubmissions.submittedBy, filters.userId))
  }
  if (filters.status) {
    conditions.push(eq(surveySubmissions.status, filters.status))
  }
  if (filters.surveyType) {
    conditions.push(eq(surveyTemplates.surveyType, filters.surveyType))
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined

  if (filters.surveyType) {
    return db
      .select({
        id: surveySubmissions.id,
        templateId: surveySubmissions.templateId,
        propertyId: surveySubmissions.propertyId,
        submittedBy: surveySubmissions.submittedBy,
        status: surveySubmissions.status,
        visitDate: surveySubmissions.visitDate,
        notes: surveySubmissions.notes,
        slug: surveySubmissions.slug,
        guestName: surveySubmissions.guestName,
        guestEmail: surveySubmissions.guestEmail,
        guestLinkId: surveySubmissions.guestLinkId,
        submittedAt: surveySubmissions.submittedAt,
        createdAt: surveySubmissions.createdAt,
        updatedAt: surveySubmissions.updatedAt,
      })
      .from(surveySubmissions)
      .innerJoin(surveyTemplates, eq(surveySubmissions.templateId, surveyTemplates.id))
      .where(whereClause)
      .orderBy(desc(surveySubmissions.createdAt))
  }

  return db
    .select()
    .from(surveySubmissions)
    .where(whereClause)
    .orderBy(desc(surveySubmissions.createdAt))
}

/**
 * Get submissions with joined property, template, and submitter data.
 * Used for the surveys list page.
 */
export async function getSubmissionsWithDetails(
  filters: SubmissionFilters = {}
) {
  const conditions = []

  if (filters.propertyId) {
    conditions.push(eq(surveySubmissions.propertyId, filters.propertyId))
  }
  if (filters.userId) {
    conditions.push(eq(surveySubmissions.submittedBy, filters.userId))
  }
  if (filters.status) {
    conditions.push(eq(surveySubmissions.status, filters.status))
  }
  if (filters.surveyType) {
    conditions.push(eq(surveyTemplates.surveyType, filters.surveyType))
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      id: surveySubmissions.id,
      templateId: surveySubmissions.templateId,
      propertyId: surveySubmissions.propertyId,
      submittedBy: surveySubmissions.submittedBy,
      status: surveySubmissions.status,
      visitDate: surveySubmissions.visitDate,
      notes: surveySubmissions.notes,
      slug: surveySubmissions.slug,
      guestName: surveySubmissions.guestName,
      guestEmail: surveySubmissions.guestEmail,
      guestLinkId: surveySubmissions.guestLinkId,
      submittedAt: surveySubmissions.submittedAt,
      createdAt: surveySubmissions.createdAt,
      updatedAt: surveySubmissions.updatedAt,
      propertyName: properties.name,
      templateName: surveyTemplates.name,
      submitterName: profiles.fullName,
      surveyType: surveyTemplates.surveyType,
    })
    .from(surveySubmissions)
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .innerJoin(surveyTemplates, eq(surveySubmissions.templateId, surveyTemplates.id))
    .leftJoin(profiles, eq(surveySubmissions.submittedBy, profiles.id))
    .where(whereClause)
    .orderBy(desc(surveySubmissions.createdAt))

  return rows
}

/**
 * Get submissions for properties assigned to a user (non-admin).
 */
export async function getSubmissionsForUser(
  userId: string,
  surveyType?: 'internal' | 'guest'
) {
  // Get all property IDs the user has access to
  const assignments = await db
    .select({ propertyId: propertyAssignments.propertyId })
    .from(propertyAssignments)
    .where(eq(propertyAssignments.userId, userId))

  const propertyIds = assignments.map((a) => a.propertyId)

  if (propertyIds.length === 0) {
    // Only get the user's own submissions
    return getSubmissionsWithDetails({ userId, surveyType })
  }

  // Get submissions by the user OR for their assigned properties
  const conditions = [
    sql`(${surveySubmissions.submittedBy} = ${userId} OR ${surveySubmissions.propertyId} IN ${propertyIds})`,
  ]
  if (surveyType) {
    conditions.push(sql`${surveyTemplates.surveyType} = ${surveyType}`)
  }

  const rows = await db
    .select({
      id: surveySubmissions.id,
      templateId: surveySubmissions.templateId,
      propertyId: surveySubmissions.propertyId,
      submittedBy: surveySubmissions.submittedBy,
      status: surveySubmissions.status,
      visitDate: surveySubmissions.visitDate,
      notes: surveySubmissions.notes,
      slug: surveySubmissions.slug,
      guestName: surveySubmissions.guestName,
      guestEmail: surveySubmissions.guestEmail,
      guestLinkId: surveySubmissions.guestLinkId,
      submittedAt: surveySubmissions.submittedAt,
      createdAt: surveySubmissions.createdAt,
      updatedAt: surveySubmissions.updatedAt,
      propertyName: properties.name,
      templateName: surveyTemplates.name,
      submitterName: profiles.fullName,
      surveyType: surveyTemplates.surveyType,
    })
    .from(surveySubmissions)
    .innerJoin(properties, eq(surveySubmissions.propertyId, properties.id))
    .innerJoin(surveyTemplates, eq(surveySubmissions.templateId, surveyTemplates.id))
    .leftJoin(profiles, eq(surveySubmissions.submittedBy, profiles.id))
    .where(and(...conditions))
    .orderBy(desc(surveySubmissions.createdAt))

  return rows
}

/**
 * Get a submission by ID with all its responses.
 */
export async function getSubmissionById(id: string) {
  const submission = await db
    .select()
    .from(surveySubmissions)
    .where(eq(surveySubmissions.id, id))
    .limit(1)

  if (!submission[0]) return null

  const responses = await db
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.submissionId, id))

  return {
    ...submission[0],
    responses,
  }
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Generate a unique slug for a submission.
 * Format: template-name-property-code-2025-02-11
 * Appends -2, -3, etc. on collision.
 */
async function generateSlug(
  templateName: string,
  propertyCode: string,
  visitDate: string,
): Promise<string> {
  const base = `${toKebab(templateName)}-${toKebab(propertyCode)}-${visitDate}`

  // Check if base slug is taken
  const existing = await db
    .select({ slug: surveySubmissions.slug })
    .from(surveySubmissions)
    .where(like(surveySubmissions.slug, `${base}%`))

  const taken = new Set(existing.map((r) => r.slug))

  if (!taken.has(base)) return base

  let counter = 2
  while (taken.has(`${base}-${counter}`)) {
    counter++
  }
  return `${base}-${counter}`
}

/**
 * Get a submission by its slug.
 */
export async function getSubmissionBySlug(slug: string) {
  const rows = await db
    .select()
    .from(surveySubmissions)
    .where(eq(surveySubmissions.slug, slug))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Create a new submission with its responses.
 */
export async function createSubmission(data: {
  submission: NewSurveySubmission
  responses: Omit<NewSurveyResponse, 'submissionId'>[]
}) {
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .insert(surveySubmissions)
      .values(data.submission)
      .returning()

    if (data.responses.length > 0) {
      await tx.insert(surveyResponses).values(
        data.responses.map((r) => ({
          ...r,
          submissionId: submission.id,
        }))
      )
    }

    // Generate a slug for the new submission
    // Look up template name and property code
    const [template] = await tx
      .select({ name: surveyTemplates.name })
      .from(surveyTemplates)
      .where(eq(surveyTemplates.id, submission.templateId))
      .limit(1)

    const [property] = await tx
      .select({ code: properties.code })
      .from(properties)
      .where(eq(properties.id, submission.propertyId))
      .limit(1)

    if (template && property) {
      const slug = await generateSlug(
        template.name,
        property.code,
        submission.visitDate,
      )
      await tx
        .update(surveySubmissions)
        .set({ slug })
        .where(eq(surveySubmissions.id, submission.id))

      return { ...submission, slug }
    }

    return submission
  })
}

/**
 * Update an existing submission and optionally replace its responses.
 */
export async function updateSubmission(
  id: string,
  data: {
    submission?: Partial<Omit<NewSurveySubmission, 'id'>>
    responses?: Omit<NewSurveyResponse, 'submissionId'>[]
  }
) {
  return db.transaction(async (tx) => {
    if (data.submission) {
      await tx
        .update(surveySubmissions)
        .set({ ...data.submission, updatedAt: new Date() })
        .where(eq(surveySubmissions.id, id))
    }

    if (data.responses) {
      // Remove old responses then insert new ones (cascade-safe)
      await tx
        .delete(surveyResponses)
        .where(eq(surveyResponses.submissionId, id))

      if (data.responses.length > 0) {
        await tx.insert(surveyResponses).values(
          data.responses.map((r) => ({
            ...r,
            submissionId: id,
          }))
        )
      }
    }

    // Return the updated submission
    const [updated] = await tx
      .select()
      .from(surveySubmissions)
      .where(eq(surveySubmissions.id, id))
      .limit(1)

    return updated
  })
}

/**
 * Mark a submission as submitted with a timestamp.
 */
/**
 * Permanently delete a template and all associated data.
 * Deletion order respects FK constraints:
 * 1. Unlink child template versions (parentId -> null)
 * 2. Delete survey responses for submissions using this template
 * 3. Delete survey submissions for this template
 * 4. Delete survey questions for each subcategory
 * 5. Delete survey subcategories for each category
 * 6. Delete survey categories
 * 7. Delete the template itself
 */
export async function deleteTemplate(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Unlink any child versions that reference this template
    await tx
      .update(surveyTemplates)
      .set({ parentId: null })
      .where(eq(surveyTemplates.parentId, id))

    // 2. Delete submissions (responses cascade-delete automatically)
    await tx
      .delete(surveySubmissions)
      .where(eq(surveySubmissions.templateId, id))

    // 3. Get category IDs
    const cats = await tx
      .select({ id: surveyCategories.id })
      .from(surveyCategories)
      .where(eq(surveyCategories.templateId, id))

    const catIds = cats.map((c) => c.id)
    if (catIds.length > 0) {
      // 4. Get subcategory IDs for these categories
      const subs = await tx
        .select({ id: surveySubcategories.id })
        .from(surveySubcategories)
        .where(sql`${surveySubcategories.categoryId} IN ${catIds}`)

      const subIds = subs.map((s) => s.id)
      if (subIds.length > 0) {
        // 5. Delete questions for these subcategories
        await tx
          .delete(surveyQuestions)
          .where(sql`${surveyQuestions.subcategoryId} IN ${subIds}`)
      }

      // 6. Delete subcategories
      await tx
        .delete(surveySubcategories)
        .where(sql`${surveySubcategories.categoryId} IN ${catIds}`)
    }

    // 7. Delete categories
    await tx
      .delete(surveyCategories)
      .where(eq(surveyCategories.templateId, id))

    // 8. Delete the template
    await tx.delete(surveyTemplates).where(eq(surveyTemplates.id, id))
  })
}

/**
 * Delete a submission and its responses (responses cascade-delete).
 */
export async function deleteSubmission(id: string): Promise<void> {
  await db.delete(surveySubmissions).where(eq(surveySubmissions.id, id))
}

export async function submitSubmission(
  id: string
): Promise<SurveySubmission | undefined> {
  const now = new Date()
  const results = await db
    .update(surveySubmissions)
    .set({
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(surveySubmissions.id, id))
    .returning()

  return results[0]
}
