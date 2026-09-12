import { and, asc, eq } from 'drizzle-orm'
import { db } from '..'
import { visitReportObservationCategories, visitReportReasons } from '../schema'

const defaultTaxonomy = [
  { name: 'Food & Beverage', categories: ['Food quality & menu execution', 'Service standards & guest experience', 'Hygiene, food safety & compliance', 'Beverage programme & bar operations', 'Cost control, inventory & waste'] },
  { name: 'Training & Development', categories: ['Service skills & SOP adherence', 'Onboarding, knowledge gaps & coaching', 'Leadership & team engagement', 'Health, safety & emergency readiness', 'Digital systems & reporting adoption'] },
  { name: 'Finance', categories: ['Revenue controls & cash handling', 'Budget & cost variance', 'Procurement, inventory & supplier controls', 'Payroll & labour productivity', 'Asset, audit & compliance'] },
  { name: 'Sales & Marketing', categories: ['Brand standards & collateral', 'Guest feedback, reputation & recovery', 'Distribution, OTAs & reservations', 'Sales pipeline & partnerships', 'Campaign performance & digital presence'] },
]

export async function ensureVisitReportTaxonomy(orgId: string) {
  await db.transaction(async (tx) => {
    await tx.insert(visitReportReasons).values(defaultTaxonomy.map((reason, index) => ({
      orgId, name: reason.name, sortOrder: (index + 1) * 10,
    }))).onConflictDoNothing()

    const reasons = await tx.select().from(visitReportReasons).where(eq(visitReportReasons.orgId, orgId))
    const reasonByName = new Map(reasons.map((reason) => [reason.name, reason]))
    const categories = defaultTaxonomy.flatMap((reason) => {
      const parent = reasonByName.get(reason.name)
      if (!parent) return []
      return reason.categories.map((name, index) => ({ orgId, primaryReasonId: parent.id, name, sortOrder: (index + 1) * 10 }))
    })
    if (categories.length) await tx.insert(visitReportObservationCategories).values(categories).onConflictDoNothing()
  })
}

export async function getVisitReportTaxonomy(orgId: string) {
  await ensureVisitReportTaxonomy(orgId)
  const [reasons, categories] = await Promise.all([
    db.select().from(visitReportReasons).where(eq(visitReportReasons.orgId, orgId)).orderBy(asc(visitReportReasons.sortOrder), asc(visitReportReasons.name)),
    db.select().from(visitReportObservationCategories).where(eq(visitReportObservationCategories.orgId, orgId)).orderBy(asc(visitReportObservationCategories.sortOrder), asc(visitReportObservationCategories.name)),
  ])
  return { reasons, categories }
}

export async function createVisitReportReason(orgId: string, data: { name: string; sortOrder?: number }) {
  const [created] = await db.insert(visitReportReasons).values({ orgId, name: data.name, sortOrder: data.sortOrder ?? 0 }).returning()
  return created
}

export async function updateVisitReportReason(orgId: string, id: string, data: { name?: string; isActive?: boolean; sortOrder?: number }) {
  const [updated] = await db.update(visitReportReasons).set({ ...data, updatedAt: new Date() })
    .where(and(eq(visitReportReasons.id, id), eq(visitReportReasons.orgId, orgId))).returning()
  return updated
}

export async function createVisitReportObservationCategory(orgId: string, data: { primaryReasonId: string; name: string; sortOrder?: number }) {
  const [reason] = await db.select({ id: visitReportReasons.id }).from(visitReportReasons)
    .where(and(eq(visitReportReasons.id, data.primaryReasonId), eq(visitReportReasons.orgId, orgId))).limit(1)
  if (!reason) return undefined
  const [created] = await db.insert(visitReportObservationCategories).values({
    orgId, primaryReasonId: data.primaryReasonId, name: data.name, sortOrder: data.sortOrder ?? 0,
  }).returning()
  return created
}

export async function updateVisitReportObservationCategory(orgId: string, id: string, data: { primaryReasonId?: string; name?: string; isActive?: boolean; sortOrder?: number }) {
  if (data.primaryReasonId) {
    const [reason] = await db.select({ id: visitReportReasons.id }).from(visitReportReasons)
      .where(and(eq(visitReportReasons.id, data.primaryReasonId), eq(visitReportReasons.orgId, orgId))).limit(1)
    if (!reason) return undefined
  }
  const [updated] = await db.update(visitReportObservationCategories).set({ ...data, updatedAt: new Date() })
    .where(and(eq(visitReportObservationCategories.id, id), eq(visitReportObservationCategories.orgId, orgId))).returning()
  return updated
}
