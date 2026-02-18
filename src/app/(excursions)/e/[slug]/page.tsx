import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPropertyBySlug, getActiveExcursionsForProperty } from '@/lib/db/queries/excursions'
import { ExcursionsPublicPage } from '@/components/excursions/excursions-public-page'

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
    title: `Experiences & Activities — ${property.name}`,
    description: `Discover curated excursions and activities at ${property.name}${property.location ? `, ${property.location}` : ''}.`,
  }
}

export default async function PublicExcursionsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)

  if (!property) {
    notFound()
  }

  const excursions = await getActiveExcursionsForProperty(property.id)

  return <ExcursionsPublicPage property={property} excursions={excursions} />
}
