'use client'

import { useState } from 'react'
import {
  Clock,
  ChevronDown,
  ExternalLink,
  MapPin,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Excursion } from '@/lib/db/schema'

interface ExcursionPublicCardProps {
  excursion: Excursion
}

export function ExcursionPublicCard({ excursion }: ExcursionPublicCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isWhatsApp = excursion.bookingUrl?.includes('wa.me')

  // Price field may carry secondary pricing detail on later lines — the pill
  // shows only the headline; the full text appears in the detail panel.
  const pricePill = excursion.price?.split('\n')[0].trim()

  const tags = excursion.tags ?? []
  const locations = excursion.locations ?? []
  const hasDetails =
    !!excursion.experience ||
    !!excursion.whatsIncluded ||
    locations.length > 0 ||
    (excursion.price?.includes('\n') ?? false)

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
        {pricePill && (
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-white/95 text-zinc-900 shadow-sm backdrop-blur-sm hover:bg-white/95 border-0 text-xs font-semibold tracking-wide">
              {pricePill}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="rounded-full border-0 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <h3 className="text-base font-semibold leading-snug tracking-tight">
          {excursion.title}
        </h3>

        {excursion.description && (
          <p
            className={cn(
              'mt-2 text-sm leading-relaxed text-muted-foreground',
              !expanded && 'line-clamp-3'
            )}
          >
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

        {/* Expandable detail */}
        {hasDetails && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-4 flex items-center gap-1 text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
              aria-expanded={expanded}
            >
              {expanded ? 'Hide details' : 'View details'}
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-300',
                  expanded && 'rotate-180'
                )}
                strokeWidth={2}
              />
            </button>

            {expanded && (
              <div className="mt-4 space-y-4 border-t pt-4 text-sm">
                {excursion.experience && (
                  <DetailBlock label="The experience" text={excursion.experience} />
                )}
                {excursion.whatsIncluded && (
                  <DetailBlock label="What's included" text={excursion.whatsIncluded} />
                )}
                {excursion.price?.includes('\n') && (
                  <DetailBlock label="Pricing" text={excursion.price} />
                )}
                {locations.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Locations
                    </h4>
                    <ul className="space-y-1.5">
                      {locations.map((loc, i) => (
                        <li key={`${loc.name}-${i}`}>
                          {loc.mapUrl ? (
                            <a
                              href={loc.mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1.5 text-emerald-700 transition-colors hover:text-emerald-900 hover:underline dark:text-emerald-400 dark:hover:text-emerald-200"
                            >
                              <MapPin
                                className="mt-0.5 size-3.5 shrink-0"
                                strokeWidth={1.5}
                              />
                              <span>{loc.name}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-start gap-1.5 text-muted-foreground">
                              <MapPin
                                className="mt-0.5 size-3.5 shrink-0"
                                strokeWidth={1.5}
                              />
                              <span>{loc.name}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
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

function DetailBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <p className="whitespace-pre-line leading-relaxed text-foreground/80">
        {text.trim()}
      </p>
    </div>
  )
}
