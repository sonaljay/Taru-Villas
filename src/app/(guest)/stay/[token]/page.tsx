import { getGuestPortalView, type GuestPortalView } from '@/lib/guest-portal/queries'
import { GuestInputError } from '@/lib/guest-portal/types'
import { GuestHome } from '@/components/guest-portal/guest-home'
export const dynamic = 'force-dynamic'
export default async function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let view: GuestPortalView | undefined
  try { view = await getGuestPortalView(token) } catch (error) {
    if (!(error instanceof GuestInputError) || error.status !== 404) throw error
  }
  if (!view) return <main className="mx-auto max-w-xl px-6 py-24"><h1 className="font-serif text-4xl">This stay link is unavailable</h1><p className="mt-5 leading-relaxed">Please contact the Taru Villas team for your current private link.</p></main>
  return <GuestHome key={token} view={view} token={token} />
}
