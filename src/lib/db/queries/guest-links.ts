import { randomBytes } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '..'
import {
  guestSurveyLinks,
  surveyTemplates,
  properties,
  type GuestSurveyLink,
} from '../schema'

/**
 * Generate a URL-safe random token (22 chars, base64url).
 */
function generateToken(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * Get or create a guest survey link for a template + property combo.
 * Uses the unique constraint to avoid duplicates.
 */
export async function getOrCreateGuestLink(
  templateId: string,
  propertyId: string,
  createdBy: string
): Promise<GuestSurveyLink> {
  // Check for existing link
  const existing = await db
    .select()
    .from(guestSurveyLinks)
    .where(
      and(
        eq(guestSurveyLinks.templateId, templateId),
        eq(guestSurveyLinks.propertyId, propertyId)
      )
    )
    .limit(1)

  if (existing[0]) return existing[0]

  // Create new link
  const [link] = await db
    .insert(guestSurveyLinks)
    .values({
      token: generateToken(),
      templateId,
      propertyId,
      createdBy,
    })
    .returning()

  return link
}

/**
 * Look up a guest link by its token, joining template + property names.
 */
export async function getGuestLinkByToken(token: string) {
  const rows = await db
    .select({
      id: guestSurveyLinks.id,
      token: guestSurveyLinks.token,
      templateId: guestSurveyLinks.templateId,
      propertyId: guestSurveyLinks.propertyId,
      createdBy: guestSurveyLinks.createdBy,
      isActive: guestSurveyLinks.isActive,
      createdAt: guestSurveyLinks.createdAt,
      updatedAt: guestSurveyLinks.updatedAt,
      templateName: surveyTemplates.name,
      templateSurveyType: surveyTemplates.surveyType,
      templateIsActive: surveyTemplates.isActive,
      propertyName: properties.name,
    })
    .from(guestSurveyLinks)
    .innerJoin(surveyTemplates, eq(guestSurveyLinks.templateId, surveyTemplates.id))
    .innerJoin(properties, eq(guestSurveyLinks.propertyId, properties.id))
    .where(eq(guestSurveyLinks.token, token))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Toggle a guest link's active status.
 */
export async function updateGuestLinkStatus(
  id: string,
  isActive: boolean
): Promise<GuestSurveyLink | undefined> {
  const results = await db
    .update(guestSurveyLinks)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(guestSurveyLinks.id, id))
    .returning()

  return results[0]
}

/**
 * List all guest links for an organization, with template/property names.
 */
export async function getGuestLinksForOrg(orgId: string) {
  return db
    .select({
      id: guestSurveyLinks.id,
      token: guestSurveyLinks.token,
      templateId: guestSurveyLinks.templateId,
      propertyId: guestSurveyLinks.propertyId,
      isActive: guestSurveyLinks.isActive,
      createdAt: guestSurveyLinks.createdAt,
      templateName: surveyTemplates.name,
      propertyName: properties.name,
    })
    .from(guestSurveyLinks)
    .innerJoin(surveyTemplates, eq(guestSurveyLinks.templateId, surveyTemplates.id))
    .innerJoin(properties, eq(guestSurveyLinks.propertyId, properties.id))
    .where(eq(surveyTemplates.orgId, orgId))
}
