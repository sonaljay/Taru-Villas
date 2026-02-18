'use client'

import { Clock, ExternalLink, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Excursion } from '@/lib/db/schema'

interface ExcursionPublicCardProps {
  excursion: Excursion
}

export function ExcursionPublicCard({ excursion }: ExcursionPublicCardProps) {
  const isWhatsApp = excursion.bookingUrl?.includes('wa.me')

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5">
      {/* Image area — 4:3 aspect */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {excursion.imageUrl ? (
          <img
            src={excursion.imageUrl}
            alt={excursion.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-100 dark:from-teal-950/40 dark:via-emerald-950/30 dark:to-cyan-950/40">
            <span className="text-5xl opacity-60 transition-transform duration-300 group-hover:scale-110">
              🌴
            </span>
          </div>
        )}

        {/* Price pill — floats over bottom-left of image */}
        {excursion.price && (
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-white/95 text-zinc-900 shadow-sm backdrop-blur-sm hover:bg-white/95 border-0 text-xs font-semibold tracking-wide">
              {excursion.price}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold leading-snug tracking-tight">
          {excursion.title}
        </h3>

        {excursion.description && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {excursion.description}
          </p>
        )}

        {/* Meta row */}
        {excursion.duration && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" strokeWidth={1.5} />
            <span>{excursion.duration}</span>
          </div>
        )}

        {/* Spacer pushes CTA to bottom */}
        <div className="flex-1" />

        {/* CTA */}
        {excursion.bookingUrl && (
          <div className="mt-5">
            {isWhatsApp ? (
              <Button
                asChild
                size="sm"
                className="w-full bg-[#25D366] text-white hover:bg-[#1fbc59] rounded-lg"
              >
                <a
                  href={excursion.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" />
                  Book via WhatsApp
                </a>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="w-full rounded-lg">
                <a
                  href={excursion.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Book Now
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
