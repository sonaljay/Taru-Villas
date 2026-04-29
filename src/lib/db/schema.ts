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
  jsonb,
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

export const sopFrequencyEnum = pgEnum('sop_frequency', [
  'daily',
  'weekly',
  'monthly',
  'yearly',
])

export const sopCompletionStatusEnum = pgEnum('sop_completion_status', [
  'pending',
  'completed',
])

export const utilityTypeEnum = pgEnum('utility_type', ['water', 'electricity'])

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
  sopCategories: many(sopCategories),
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
  sopAssignments: many(sopAssignments),
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
  sopAssignments: many(sopAssignments),
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
// SOP Categories (org-level grouping for templates)
// ---------------------------------------------------------------------------
export const sopCategories = pgTable(
  'sop_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_categories_org_name_unique').on(table.orgId, table.name),
  ]
)

export const sopCategoriesRelations = relations(sopCategories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sopCategories.orgId],
    references: [organizations.id],
  }),
  templates: many(sopTemplates),
}))

// ---------------------------------------------------------------------------
// SOP Templates
// ---------------------------------------------------------------------------
export const sopTemplates = pgTable('sop_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: uuid('category_id').references(() => sopCategories.id, {
    onDelete: 'restrict',
  }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sopTemplatesRelations = relations(sopTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sopTemplates.orgId],
    references: [organizations.id],
  }),
  category: one(sopCategories, {
    fields: [sopTemplates.categoryId],
    references: [sopCategories.id],
  }),
  sections: many(sopSections),
  items: many(sopItems),
  assignments: many(sopAssignments),
}))

// ---------------------------------------------------------------------------
// SOP Sections (optional grouping within a template)
// ---------------------------------------------------------------------------
export const sopSections = pgTable('sop_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => sopTemplates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sopSectionsRelations = relations(sopSections, ({ one, many }) => ({
  template: one(sopTemplates, {
    fields: [sopSections.templateId],
    references: [sopTemplates.id],
  }),
  items: many(sopItems),
}))

// ---------------------------------------------------------------------------
// SOP Items (checklist items)
// ---------------------------------------------------------------------------
export const sopItems = pgTable('sop_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => sopTemplates.id, { onDelete: 'cascade' }),
  sectionId: uuid('section_id')
    .references(() => sopSections.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sopItemsRelations = relations(sopItems, ({ one }) => ({
  template: one(sopTemplates, {
    fields: [sopItems.templateId],
    references: [sopTemplates.id],
  }),
  section: one(sopSections, {
    fields: [sopItems.sectionId],
    references: [sopSections.id],
  }),
}))

// ---------------------------------------------------------------------------
// SOP Assignments (who does what, where, when)
// ---------------------------------------------------------------------------
export const sopAssignments = pgTable(
  'sop_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => sopTemplates.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    frequency: sopFrequencyEnum('frequency').notNull(),
    deadlineTime: text('deadline_time').notNull(),
    deadlineDay: integer('deadline_day'),
    deadlineMonth: integer('deadline_month'),  // for yearly: 1-12
    isActive: boolean('is_active').default(true).notNull(),
    notifyOnOverdue: boolean('notify_on_overdue').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_assignments_template_property_user_unique').on(
      table.templateId,
      table.propertyId,
      table.userId
    ),
  ]
)

export const sopAssignmentsRelations = relations(sopAssignments, ({ one, many }) => ({
  template: one(sopTemplates, {
    fields: [sopAssignments.templateId],
    references: [sopTemplates.id],
  }),
  property: one(properties, {
    fields: [sopAssignments.propertyId],
    references: [properties.id],
  }),
  user: one(profiles, {
    fields: [sopAssignments.userId],
    references: [profiles.id],
  }),
  completions: many(sopCompletions),
}))

// ---------------------------------------------------------------------------
// SOP Completions (instance for a specific due date)
// ---------------------------------------------------------------------------
export const sopCompletions = pgTable(
  'sop_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => sopAssignments.id, { onDelete: 'cascade' }),
    dueDate: date('due_date').notNull(),
    status: sopCompletionStatusEnum('status').default('pending').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_completions_assignment_due_date_unique').on(
      table.assignmentId,
      table.dueDate
    ),
  ]
)

export const sopCompletionsRelations = relations(sopCompletions, ({ one, many }) => ({
  assignment: one(sopAssignments, {
    fields: [sopCompletions.assignmentId],
    references: [sopAssignments.id],
  }),
  itemCompletions: many(sopItemCompletions),
}))

// ---------------------------------------------------------------------------
// SOP Item Completions (individual check-offs)
// ---------------------------------------------------------------------------
export const sopItemCompletions = pgTable(
  'sop_item_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    completionId: uuid('completion_id')
      .notNull()
      .references(() => sopCompletions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => sopItems.id, { onDelete: 'cascade' }),
    isChecked: boolean('is_checked').default(false).notNull(),
    note: text('note'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_item_completions_completion_item_unique').on(
      table.completionId,
      table.itemId
    ),
  ]
)

export const sopItemCompletionsRelations = relations(sopItemCompletions, ({ one }) => ({
  completion: one(sopCompletions, {
    fields: [sopItemCompletions.completionId],
    references: [sopCompletions.id],
  }),
  item: one(sopItems, {
    fields: [sopItemCompletions.itemId],
    references: [sopItems.id],
  }),
}))

// ---------------------------------------------------------------------------
// Allowed Emails (whitelist for email/password auth)
// ---------------------------------------------------------------------------
export const allowedEmails = pgTable('allowed_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  addedBy: uuid('added_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const allowedEmailsRelations = relations(allowedEmails, ({ one }) => ({
  organization: one(organizations, { fields: [allowedEmails.orgId], references: [organizations.id] }),
  addedByProfile: one(profiles, { fields: [allowedEmails.addedBy], references: [profiles.id] }),
}))

// ---------------------------------------------------------------------------
// Utility Rate Tiers (tiered pricing for water/electricity)
// ---------------------------------------------------------------------------
export const utilityRateTiers = pgTable(
  'utility_rate_tiers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    tierNumber: integer('tier_number').notNull(),
    minUnits: numeric('min_units', { precision: 10, scale: 2 }).notNull(),
    maxUnits: numeric('max_units', { precision: 10, scale: 2 }),
    ratePerUnit: numeric('rate_per_unit', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_rate_tiers_property_type_tier_unique').on(
      table.propertyId,
      table.utilityType,
      table.tierNumber
    ),
  ]
)

export const utilityRateTiersRelations = relations(utilityRateTiers, ({ one }) => ({
  property: one(properties, {
    fields: [utilityRateTiers.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Utility Meter Readings (daily cumulative readings)
// ---------------------------------------------------------------------------
export const utilityMeterReadings = pgTable(
  'utility_meter_readings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    readingDate: date('reading_date').notNull(),
    readingValue: numeric('reading_value', { precision: 12, scale: 2 }).notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_meter_readings_property_type_date_unique').on(
      table.propertyId,
      table.utilityType,
      table.readingDate
    ),
  ]
)

export const utilityMeterReadingsRelations = relations(utilityMeterReadings, ({ one }) => ({
  property: one(properties, {
    fields: [utilityMeterReadings.propertyId],
    references: [properties.id],
  }),
  recorder: one(profiles, {
    fields: [utilityMeterReadings.recordedBy],
    references: [profiles.id],
  }),
}))

// ---------------------------------------------------------------------------
// OTA reviews (external review aggregation — Google, etc.)
// ---------------------------------------------------------------------------
export const otaReviewSources = pgTable(
  'ota_review_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['google'] as const }).notNull(),
    externalId: text('external_id').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    lastFetchError: text('last_fetch_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    propertySourceUnique: unique('ota_review_sources_property_source_unique').on(
      t.propertyId,
      t.source
    ),
  })
)

export const otaReviews = pgTable(
  'ota_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => otaReviewSources.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    externalReviewId: text('external_review_id').notNull(),
    authorName: text('author_name'),
    rating: integer('rating').notNull(),
    text: text('text'),
    language: text('language'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    rawPayload: jsonb('raw_payload'),
  },
  (t) => ({
    sourceExternalIdUnique: unique('ota_reviews_source_external_id_unique').on(
      t.sourceId,
      t.externalReviewId
    ),
  })
)

export const otaSyntheses = pgTable('ota_syntheses', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  reviewsAnalyzed: integer('reviews_analyzed').notNull(),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }),
  aspectScores: jsonb('aspect_scores').default(sql`'{}'::jsonb`).notNull(),
  strengths: jsonb('strengths').default(sql`'[]'::jsonb`).notNull(),
  weaknesses: jsonb('weaknesses').default(sql`'[]'::jsonb`).notNull(),
  repetitiveIssues: jsonb('repetitive_issues').default(sql`'[]'::jsonb`).notNull(),
  status: text('status', { enum: ['ok', 'insufficient_data', 'error'] as const }).default('ok').notNull(),
  errorMessage: text('error_message'),
  modelUsed: text('model_used').notNull(),
  promptVersion: text('prompt_version').notNull(),
  costUsd: numeric('cost_usd', { precision: 8, scale: 4 }),
})

export const otaReviewSourcesRelations = relations(otaReviewSources, ({ one, many }) => ({
  property: one(properties, {
    fields: [otaReviewSources.propertyId],
    references: [properties.id],
  }),
  reviews: many(otaReviews),
}))

export const otaReviewsRelations = relations(otaReviews, ({ one }) => ({
  source: one(otaReviewSources, {
    fields: [otaReviews.sourceId],
    references: [otaReviewSources.id],
  }),
  property: one(properties, {
    fields: [otaReviews.propertyId],
    references: [properties.id],
  }),
}))

export const otaSynthesesRelations = relations(otaSyntheses, ({ one }) => ({
  property: one(properties, {
    fields: [otaSyntheses.propertyId],
    references: [properties.id],
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

export type SopTemplate = typeof sopTemplates.$inferSelect
export type NewSopTemplate = typeof sopTemplates.$inferInsert

export type SopSection = typeof sopSections.$inferSelect
export type NewSopSection = typeof sopSections.$inferInsert

export type SopItem = typeof sopItems.$inferSelect
export type NewSopItem = typeof sopItems.$inferInsert

export type SopAssignment = typeof sopAssignments.$inferSelect
export type NewSopAssignment = typeof sopAssignments.$inferInsert

export type SopCompletion = typeof sopCompletions.$inferSelect
export type NewSopCompletion = typeof sopCompletions.$inferInsert

export type SopItemCompletion = typeof sopItemCompletions.$inferSelect
export type NewSopItemCompletion = typeof sopItemCompletions.$inferInsert

export type SopCategory = typeof sopCategories.$inferSelect
export type NewSopCategory = typeof sopCategories.$inferInsert

export type AllowedEmail = typeof allowedEmails.$inferSelect
export type NewAllowedEmail = typeof allowedEmails.$inferInsert

export type UtilityRateTier = typeof utilityRateTiers.$inferSelect
export type NewUtilityRateTier = typeof utilityRateTiers.$inferInsert

export type UtilityMeterReading = typeof utilityMeterReadings.$inferSelect
export type NewUtilityMeterReading = typeof utilityMeterReadings.$inferInsert

export type OtaReviewSource = typeof otaReviewSources.$inferSelect
export type NewOtaReviewSource = typeof otaReviewSources.$inferInsert

export type OtaReview = typeof otaReviews.$inferSelect
export type NewOtaReview = typeof otaReviews.$inferInsert

export type OtaSynthesis = typeof otaSyntheses.$inferSelect
export type NewOtaSynthesis = typeof otaSyntheses.$inferInsert
