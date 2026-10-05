'use client'
import type { Excursion } from '@/lib/db/schema'
import { ExcursionPublicCard } from '@/components/excursions/excursion-public-card'
import { Button } from '@/components/ui/button'
import type { RequestSelection } from './guest-menu'
export function GuestExcursions({ excursions, disabled, onRequest }: { excursions: Excursion[]; disabled: boolean; onRequest: (selection: RequestSelection) => void }) {
  if (!excursions.length) return <p className="py-8">Speak with our team to discover experiences around your villa.</p>
  return <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{excursions.map(excursion => <div key={excursion.id} className="flex flex-col gap-3"><ExcursionPublicCard excursion={{ ...excursion, bookingUrl: null }} /><Button disabled={disabled} variant="outline" onClick={() => onRequest({ kind: 'excursion', itemId: excursion.id, itemKind: 'excursion', title: excursion.title })}>Request this experience</Button></div>)}</div>
}
