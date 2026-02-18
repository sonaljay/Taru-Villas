import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPropertyBySlug } from '@/lib/db/queries/excursions'
import { getActiveMenuForProperty } from '@/lib/db/queries/menus'
import { MenusPublicPage } from '@/components/menus/menus-public-page'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)

  if (!property) {
    return { title: 'Not Found' }
  }

  return {
    title: `Our Menu — ${property.name}`,
    description: `Explore the menu at ${property.name}${property.location ? `, ${property.location}` : ''}.`,
  }
}

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)

  if (!property) {
    notFound()
  }

  const categories = await getActiveMenuForProperty(property.id)

  return <MenusPublicPage property={property} categories={categories} />
}
