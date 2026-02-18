'use client'

import { MapPin } from 'lucide-react'
import { ExcursionPublicCard } from '@/components/excursions/excursion-public-card'
import type { Property, Excursion } from '@/lib/db/schema'

interface ExcursionsPublicPageProps {
  property: Property
  excursions: Excursion[]
}

export function ExcursionsPublicPage({
  property,
  excursions,
}: ExcursionsPublicPageProps) {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative isolate overflow-hidden">
        {/* Background — image or gradient */}
        {property.imageUrl ? (
          <>
            <img
              src={property.imageUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            />
            {/* Dark scrim with a warm tint */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-950" />
        )}

        {/* Subtle grain texture overlay */}
        <div
          className="absolute inset-0 -z-[5] opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="mx-auto max-w-6xl px-4 py-24 sm:py-32 md:py-40">
          {/* Decorative rule */}
          <div
            className="mb-6 h-px w-16 bg-white/40"
            style={{ animationDelay: '0ms' }}
          />

          <p
            className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-white/70"
            style={{
              animation: 'excHeroFade 0.8s ease-out both',
              animationDelay: '100ms',
            }}
          >
            Experiences &amp; Activities
          </p>

          <h1
            className="text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl"
            style={{
              animation: 'excHeroFade 0.8s ease-out both',
              animationDelay: '200ms',
            }}
          >
            {property.name}
          </h1>

          {property.location && (
            <div
              className="mt-5 flex items-center gap-2 text-white/70"
              style={{
                animation: 'excHeroFade 0.8s ease-out both',
                animationDelay: '350ms',
              }}
            >
              <MapPin className="size-4" strokeWidth={1.5} />
              <span className="text-sm tracking-wide">{property.location}</span>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Cards grid                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {excursions.length > 0 ? (
          <>
            <p className="mb-8 text-sm text-muted-foreground tracking-wide">
              {excursions.length} experience{excursions.length !== 1 ? 's' : ''} available
            </p>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {excursions.map((excursion, i) => (
                <div
                  key={excursion.id}
                  style={{
                    animation: 'excCardIn 0.6s ease-out both',
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <ExcursionPublicCard excursion={excursion} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 h-px w-12 bg-border" />
            <p className="text-lg font-light tracking-wide text-muted-foreground">
              Experiences coming soon
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground/70">
              We&rsquo;re curating a selection of activities for your stay.
              Check back shortly.
            </p>
          </div>
        )}
      </section>

      {/* Keyframes — scoped via globals-compatible @keyframes */}
      <style>{`
        @keyframes excHeroFade {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes excCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
