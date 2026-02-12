import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!
const client = postgres(connectionString)
const db = drizzle(client, { schema })

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function seed() {
  console.log('Seeding database...')

  // ------ Organization ------
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: 'Taru Villas',
      slug: 'taru-villas',
      logoUrl: '/logo.png',
    })
    .returning()

  console.log(`Created organization: ${org.name} (${org.id})`)

  // ------ Properties ------
  const propertyData: {
    name: string
    slug: string
    code: string
    location: string
  }[] = [
    { name: 'Taru Villas - 906', slug: '906', code: '906', location: 'Sri Lanka' },
    { name: 'Taru Villas - Emendy', slug: 'emendy', code: 'EMENDY', location: 'Sri Lanka' },
    { name: 'Taru Villas - Kandy', slug: 'kandy', code: 'KANDY', location: 'Kandy, Sri Lanka' },
    { name: 'Taru Villas - Levita', slug: 'levita', code: 'LEVITA', location: 'Sri Lanka' },
    { name: 'Taru Villas - Maia', slug: 'maia', code: 'MAIA', location: 'Sri Lanka' },
    { name: 'Taru Villas - Mawella', slug: 'mawella', code: 'MAWELLA', location: 'Mawella, Sri Lanka' },
    { name: 'Taru Villas - Nilaveli', slug: 'nilaveli', code: 'NILAVELI', location: 'Nilaveli, Sri Lanka' },
    { name: 'Taru Villas - Rampart', slug: 'rampart', code: 'RAMPART', location: 'Sri Lanka' },
    { name: 'The Lake House', slug: 'the-lake-house', code: 'TLH', location: 'Sri Lanka' },
    { name: 'Taru Villas - Villu', slug: 'villu', code: 'VILLU', location: 'Sri Lanka' },
  ]

  const insertedProperties = await db
    .insert(schema.properties)
    .values(
      propertyData.map((p) => ({
        orgId: org.id,
        name: p.name,
        slug: p.slug,
        code: p.code,
        imageUrl: `/properties/${p.code}.png`,
        location: p.location,
        isActive: true,
      }))
    )
    .returning()

  console.log(`Created ${insertedProperties.length} properties`)

  // createdBy is nullable — will be linked to a real user after first sign-in

  // ------ Survey Template ------
  const categoriesWithQuestions = [
    {
      name: 'Housekeeping',
      description: 'Cleanliness and housekeeping standards',
      sortOrder: 1,
      weight: '2.0',
      questions: [
        { text: 'Room Cleanliness', sortOrder: 1 },
        { text: 'Bathroom Standards', sortOrder: 2 },
        { text: 'Linen Quality', sortOrder: 3 },
        { text: 'Common Area Tidiness', sortOrder: 4 },
        { text: 'Turn-down Service', sortOrder: 5 },
      ],
    },
    {
      name: 'Food & Beverage',
      description: 'Food and beverage quality and service',
      sortOrder: 2,
      weight: '1.5',
      questions: [
        { text: 'Breakfast Quality', sortOrder: 1 },
        { text: 'Menu Variety', sortOrder: 2 },
        { text: 'Food Presentation', sortOrder: 3 },
        { text: 'Service Speed', sortOrder: 4 },
        { text: 'Bar Standards', sortOrder: 5 },
      ],
    },
    {
      name: 'Guest Experience',
      description: 'Overall guest experience and service quality',
      sortOrder: 3,
      weight: '2.0',
      questions: [
        { text: 'Welcome & Check-in', sortOrder: 1 },
        { text: 'Staff Friendliness', sortOrder: 2 },
        { text: 'Concierge Service', sortOrder: 3 },
        { text: 'Complaint Resolution', sortOrder: 4 },
        { text: 'Check-out Process', sortOrder: 5 },
      ],
    },
    {
      name: 'Maintenance',
      description: 'Property maintenance and upkeep',
      sortOrder: 4,
      weight: '1.5',
      questions: [
        { text: 'Building Exterior', sortOrder: 1 },
        { text: 'Pool & Garden', sortOrder: 2 },
        { text: 'Air Conditioning', sortOrder: 3 },
        { text: 'Plumbing', sortOrder: 4 },
        { text: 'Electrical Systems', sortOrder: 5 },
      ],
    },
    {
      name: 'Safety & Security',
      description: 'Safety equipment and security protocols',
      sortOrder: 5,
      weight: '1.0',
      questions: [
        { text: 'Fire Safety Equipment', sortOrder: 1 },
        { text: 'Emergency Procedures', sortOrder: 2 },
        { text: 'CCTV & Lighting', sortOrder: 3 },
        { text: 'First Aid Supplies', sortOrder: 4 },
        { text: 'Staff Safety Awareness', sortOrder: 5 },
      ],
    },
    {
      name: 'Landscaping',
      description: 'Outdoor areas and landscaping quality',
      sortOrder: 6,
      weight: '1.0',
      questions: [
        { text: 'Garden Maintenance', sortOrder: 1 },
        { text: 'Pool Area', sortOrder: 2 },
        { text: 'Driveway & Entrance', sortOrder: 3 },
        { text: 'Outdoor Furniture', sortOrder: 4 },
        { text: 'Lighting & Ambiance', sortOrder: 5 },
      ],
    },
  ]

  // Insert the template
  const [template] = await db
    .insert(schema.surveyTemplates)
    .values({
      orgId: org.id,
      name: 'Standard Property Audit',
      description:
        'Comprehensive property audit template covering all key areas of villa management.',
      version: 1,
      isActive: true,
      createdBy: null,
    })
    .returning()

  console.log(`Created template: ${template.name} (${template.id})`)

  // Insert categories and questions
  for (const cat of categoriesWithQuestions) {
    const [category] = await db
      .insert(schema.surveyCategories)
      .values({
        templateId: template.id,
        name: cat.name,
        description: cat.description,
        sortOrder: cat.sortOrder,
        weight: cat.weight,
      })
      .returning()

    // Create a default subcategory for each category
    const [subcategory] = await db
      .insert(schema.surveySubcategories)
      .values({
        categoryId: category.id,
        name: cat.name,
        sortOrder: 0,
      })
      .returning()

    await db.insert(schema.surveyQuestions).values(
      cat.questions.map((q) => ({
        subcategoryId: subcategory.id,
        text: q.text,
        scaleMin: 1,
        scaleMax: 10,
        isRequired: true,
        sortOrder: q.sortOrder,
      }))
    )

    console.log(
      `  Category "${cat.name}" with ${cat.questions.length} questions`
    )
  }

  console.log('\nSeed complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
