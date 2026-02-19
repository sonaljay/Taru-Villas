import {
  pgTable,
  pgSchema,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Auth schema (Supabase auth.users reference)
// ---------------------------------------------------------------------------
const authSchema = pgSchema('auth')
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'property_manager',
  'staff',
])

export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'reviewed',
])

export const surveyTypeEnum = pgEnum('survey_type', ['internal', 'guest'])

export const taskStatusEnum = pgEnum('task_status', [
  'open',
  'investigating',
  'closed',
])

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const organizationsRelations = relations(organizations, ({ many }) => ({
  properties: many(properties),
  profiles: many(profiles),
  surveyTemplates: many(surveyTemplates),
}))

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  imageUrl: text('image_url'),
  menuCoverImageUrl: text('menu_cover_image_url'),
  excursionCoverImageUrl: text('excursion_cover_image_url'),
  location: text('location'),
  primaryPmId: uuid('primary_pm_id')
    .references(() => profiles.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.orgId],
    references: [organizations.id],
  }),
  primaryPm: one(profiles, {
    fields: [properties.primaryPmId],
    references: [profiles.id],
  }),
  propertyAssignments: many(propertyAssignments),
  surveySubmissions: many(surveySubmissions),
  tasks: many(tasks),
  excursions: many(excursions),
  menuCategories: many(menuCategories),
}))

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: userRoleEnum('role').notNull(),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [profiles.orgId],
    references: [organizations.id],
  }),
  propertyAssignments: many(propertyAssignments),
  surveySubmissions: many(surveySubmissions),
  createdTemplates: many(surveyTemplates),
}))

// ---------------------------------------------------------------------------
// Property Assignments
// ---------------------------------------------------------------------------
export const propertyAssignments = pgTable(
  'property_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('property_assignments_user_property_unique').on(
      table.userId,
      table.propertyId
    ),
  ]
)

export const propertyAssignmentsRelations = relations(
  propertyAssignments,
  ({ one }) => ({
    user: one(profiles, {
      fields: [propertyAssignments.userId],
      references: [profiles.id],
    }),
    property: one(properties, {
      fields: [propertyAssignments.propertyId],
      references: [properties.id],
    }),
  })
)

// ---------------------------------------------------------------------------
// Survey Templates
// ---------------------------------------------------------------------------
export const surveyTemplates = pgTable('survey_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  parentId: uuid('parent_id'),
  surveyType: surveyTypeEnum('survey_type').default('internal').notNull(),
  createdBy: uuid('created_by')
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyTemplatesRelations = relations(
  surveyTemplates,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [surveyTemplates.orgId],
      references: [organizations.id],
    }),
    creator: one(profiles, {
      fields: [surveyTemplates.createdBy],
      references: [profiles.id],
    }),
    parent: one(surveyTemplates, {
      fields: [surveyTemplates.parentId],
      references: [surveyTemplates.id],
    }),
    categories: many(surveyCategories),
    submissions: many(surveySubmissions),
  })
)

// ---------------------------------------------------------------------------
// Survey Categories
// ---------------------------------------------------------------------------
export const surveyCategories = pgTable('survey_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => surveyTemplates.id),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull(),
  weight: numeric('weight', { precision: 5, scale: 2 }).default('1.0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyCategoriesRelations = relations(
  surveyCategories,
  ({ one, many }) => ({
    template: one(surveyTemplates, {
      fields: [surveyCategories.templateId],
      references: [surveyTemplates.id],
    }),
    subcategories: many(surveySubcategories),
  })
)

// ---------------------------------------------------------------------------
// Survey Subcategories
// ---------------------------------------------------------------------------
export const surveySubcategories = pgTable('survey_subcategories', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => surveyCategories.id),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveySubcategoriesRelations = relations(
  surveySubcategories,
  ({ one, many }) => ({
    category: one(surveyCategories, {
      fields: [surveySubcategories.categoryId],
      references: [surveyCategories.id],
    }),
    questions: many(surveyQuestions),
  })
)

// ---------------------------------------------------------------------------
// Survey Questions
// ---------------------------------------------------------------------------
export const surveyQuestions = pgTable('survey_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  subcategoryId: uuid('subcategory_id')
    .notNull()
    .references(() => surveySubcategories.id),
  text: text('text').notNull(),
  description: text('description'),
  scaleMin: integer('scale_min').default(1).notNull(),
  scaleMax: integer('scale_max').default(10).notNull(),
  isRequired: boolean('is_required').default(true).notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyQuestionsRelations = relations(
  surveyQuestions,
  ({ one, many }) => ({
    subcategory: one(surveySubcategories, {
      fields: [surveyQuestions.subcategoryId],
      references: [surveySubcategories.id],
    }),
    responses: many(surveyResponses),
  })
)

// ---------------------------------------------------------------------------
// Guest Survey Links
// ---------------------------------------------------------------------------
export const guestSurveyLinks = pgTable(
  'guest_survey_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => surveyTemplates.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('guest_survey_links_template_property_unique').on(
      table.templateId,
      table.propertyId
    ),
  ]
)

export const guestSurveyLinksRelations = relations(
  guestSurveyLinks,
  ({ one }) => ({
    template: one(surveyTemplates, {
      fields: [guestSurveyLinks.templateId],
      references: [surveyTemplates.id],
    }),
    property: one(properties, {
      fields: [guestSurveyLinks.propertyId],
      references: [properties.id],
    }),
    creator: one(profiles, {
      fields: [guestSurveyLinks.createdBy],
      references: [profiles.id],
    }),
  })
)

// ---------------------------------------------------------------------------
// Survey Submissions
// ---------------------------------------------------------------------------
export const surveySubmissions = pgTable('survey_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => surveyTemplates.id),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id),
  submittedBy: uuid('submitted_by')
    .references(() => profiles.id),
  status: submissionStatusEnum('status').default('draft').notNull(),
  visitDate: date('visit_date').notNull(),
  notes: text('notes'),
  slug: varchar('slug', { length: 255 }).unique(),
  guestName: text('guest_name'),
  guestEmail: text('guest_email'),
  guestLinkId: uuid('guest_link_id')
    .references(() => guestSurveyLinks.id, { onDelete: 'set null' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveySubmissionsRelations = relations(
  surveySubmissions,
  ({ one, many }) => ({
    template: one(surveyTemplates, {
      fields: [surveySubmissions.templateId],
      references: [surveyTemplates.id],
    }),
    property: one(properties, {
      fields: [surveySubmissions.propertyId],
      references: [properties.id],
    }),
    submitter: one(profiles, {
      fields: [surveySubmissions.submittedBy],
      references: [profiles.id],
    }),
    responses: many(surveyResponses),
  })
)

// ---------------------------------------------------------------------------
// Survey Responses
// ---------------------------------------------------------------------------
export const surveyResponses = pgTable('survey_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => surveySubmissions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id')
    .notNull()
    .references(() => surveyQuestions.id),
  score: integer('score').notNull(),
  note: text('note'),
  issueDescription: text('issue_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const surveyResponsesRelations = relations(
  surveyResponses,
  ({ one }) => ({
    submission: one(surveySubmissions, {
      fields: [surveyResponses.submissionId],
      references: [surveySubmissions.id],
    }),
    question: one(surveyQuestions, {
      fields: [surveyResponses.questionId],
      references: [surveyQuestions.id],
    }),
  })
)

// ---------------------------------------------------------------------------
// Tasks (auto-created from low-score survey responses)
// ---------------------------------------------------------------------------
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => surveySubmissions.id),
  responseId: uuid('response_id')
    .notNull()
    .references(() => surveyResponses.id),
  questionId: uuid('question_id')
    .notNull()
    .references(() => surveyQuestions.id),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').default('open').notNull(),
  assignedTo: uuid('assigned_to')
    .references(() => profiles.id, { onDelete: 'set null' }),
  isRepeatIssue: boolean('is_repeat_issue').default(false).notNull(),
  closingNotes: text('closing_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by')
    .references(() => profiles.id, { onDelete: 'set null' }),
})

export const tasksRelations = relations(tasks, ({ one }) => ({
  organization: one(organizations, {
    fields: [tasks.orgId],
    references: [organizations.id],
  }),
  property: one(properties, {
    fields: [tasks.propertyId],
    references: [properties.id],
  }),
  submission: one(surveySubmissions, {
    fields: [tasks.submissionId],
    references: [surveySubmissions.id],
  }),
  response: one(surveyResponses, {
    fields: [tasks.responseId],
    references: [surveyResponses.id],
  }),
  question: one(surveyQuestions, {
    fields: [tasks.questionId],
    references: [surveyQuestions.id],
  }),
  assignee: one(profiles, {
    fields: [tasks.assignedTo],
    references: [profiles.id],
    relationName: 'taskAssignee',
  }),
  closer: one(profiles, {
    fields: [tasks.closedBy],
    references: [profiles.id],
    relationName: 'taskCloser',
  }),
}))

// ---------------------------------------------------------------------------
// Excursions
// ---------------------------------------------------------------------------
export const excursions = pgTable('excursions', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  price: text('price'),
  duration: text('duration'),
  bookingUrl: text('booking_url'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const excursionsRelations = relations(excursions, ({ one }) => ({
  property: one(properties, {
    fields: [excursions.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Menu Categories
// ---------------------------------------------------------------------------
export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  property: one(properties, {
    fields: [menuCategories.propertyId],
    references: [properties.id],
  }),
  menuItems: many(menuItems),
}))

// ---------------------------------------------------------------------------
// Menu Items
// ---------------------------------------------------------------------------
export const menuItems = pgTable('menu_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => menuCategories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  price: text('price'),
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
}))

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------
export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert

export type Property = typeof properties.$inferSelect
export type NewProperty = typeof properties.$inferInsert

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert

export type PropertyAssignment = typeof propertyAssignments.$inferSelect
export type NewPropertyAssignment = typeof propertyAssignments.$inferInsert

export type SurveyTemplate = typeof surveyTemplates.$inferSelect
export type NewSurveyTemplate = typeof surveyTemplates.$inferInsert

export type SurveyCategory = typeof surveyCategories.$inferSelect
export type NewSurveyCategory = typeof surveyCategories.$inferInsert

export type SurveySubcategory = typeof surveySubcategories.$inferSelect
export type NewSurveySubcategory = typeof surveySubcategories.$inferInsert

export type SurveyQuestion = typeof surveyQuestions.$inferSelect
export type NewSurveyQuestion = typeof surveyQuestions.$inferInsert

export type SurveySubmission = typeof surveySubmissions.$inferSelect
export type NewSurveySubmission = typeof surveySubmissions.$inferInsert

export type SurveyResponse = typeof surveyResponses.$inferSelect
export type NewSurveyResponse = typeof surveyResponses.$inferInsert

export type GuestSurveyLink = typeof guestSurveyLinks.$inferSelect
export type NewGuestSurveyLink = typeof guestSurveyLinks.$inferInsert

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

export type Excursion = typeof excursions.$inferSelect
export type NewExcursion = typeof excursions.$inferInsert

export type MenuCategory = typeof menuCategories.$inferSelect
export type NewMenuCategory = typeof menuCategories.$inferInsert

export type MenuItem = typeof menuItems.$inferSelect
export type NewMenuItem = typeof menuItems.$inferInsert
