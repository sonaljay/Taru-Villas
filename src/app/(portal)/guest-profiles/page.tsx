import Link from 'next/link'
import { requireRole } from '@/lib/auth/guards'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { UserCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function GuestProfilesPickerPage() {
  const profile = await requireRole(['admin', 'property_manager'])
  const properties = await getPropertiesForUser(profile.id)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Guest Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Select a property to view arrivals and pre-arrival status.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => (
          <Link key={property.id} href={`/properties/${property.id}/guest-profiles`}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserCheck className="size-4" />
                  {property.name}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
