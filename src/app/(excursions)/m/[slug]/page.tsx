import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPropertyBySlug } from '@/lib/db/queries/excursions'
import {
  getSetMenusForProperty,
  getALaCarteMenuForProperty,
} from '@/lib/db/queries/menus'
import { MenusPublicPage } from '@/components/menus/menus-public-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) return { title: 'Not Found' }
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
  if (!property) notFound()

  const [setMenus, aLaCarte] = await Promise.all([
    getSetMenusForProperty(property.id),
    getALaCarteMenuForProperty(property.id),
  ])

  // Day-of-week (0=Sun..6=Sat) in Sri Lanka time.
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
  }).format(new Date())
  const todayDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)

  return (
    <MenusPublicPage
      property={property}
      setMenus={setMenus}
      aLaCarte={aLaCarte}
      todayDow={todayDow}
    />
  )
}
