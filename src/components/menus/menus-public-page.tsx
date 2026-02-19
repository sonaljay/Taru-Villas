'use client'

import { MapPin } from 'lucide-react'
import { MenuItemPublicCard } from '@/components/menus/menu-item-public-card'
import { TraditionalMenuLayout } from '@/components/menus/traditional-menu-layout'
import type { Property } from '@/lib/db/schema'
import type { MenuCategoryWithItems } from '@/lib/db/queries/menus'

interface MenusPublicPageProps {
  property: Property
  categories: MenuCategoryWithItems[]
}

export function MenusPublicPage({
  property,
  categories,
}: MenusPublicPageProps) {
  const heroImage = property.menuCoverImageUrl || property.imageUrl
  const hasAnyImages = categories.some((cat) =>
    cat.menuItems.some((item) => !!item.imageUrl)
  )
  let globalCardIndex = 0

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative isolate overflow-hidden">
        {/* Background — image or gradient */}
        {heroImage ? (
          <>
            <img
              src={heroImage}
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
              animation: 'menuHeroFade 0.8s ease-out both',
              animationDelay: '100ms',
            }}
          >
            Our Menu
          </p>

          <h1
            className="text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl"
            style={{
              animation: 'menuHeroFade 0.8s ease-out both',
              animationDelay: '200ms',
            }}
          >
            {property.name}
          </h1>

          {property.location && (
            <div
              className="mt-5 flex items-center gap-2 text-white/70"
              style={{
                animation: 'menuHeroFade 0.8s ease-out both',
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
      {/* Menu sections by category                                           */}
      {/* ------------------------------------------------------------------ */}
      {categories.length > 0 ? (
        hasAnyImages ? (
          /* Card grid layout — when items have images */
          <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
            <div className="space-y-16">
              {categories.map((category, catIndex) => {
                const itemStartIndex = globalCardIndex
                globalCardIndex += category.menuItems.length

                return (
                  <div key={category.id}>
                    {/* Category header */}
                    <div
                      className="mb-8"
                      style={{
                        animation: 'menuHeroFade 0.6s ease-out both',
                        animationDelay: `${catIndex * 120 + 100}ms`,
                      }}
                    >
                      <div className="flex items-center gap-4 mb-3">
                        <div className="h-px flex-1 bg-border" />
                        <h2 className="text-lg font-medium uppercase tracking-[0.15em] text-foreground/80 sm:text-xl">
                          {category.name}
                        </h2>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      {category.description && (
                        <p className="text-center text-sm text-muted-foreground max-w-lg mx-auto">
                          {category.description}
                        </p>
                      )}
                    </div>

                    {/* Items grid */}
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {category.menuItems.map((item, i) => (
                        <div
                          key={item.id}
                          style={{
                            animation: 'menuCardIn 0.6s ease-out both',
                            animationDelay: `${(itemStartIndex + i) * 80}ms`,
                          }}
                        >
                          <MenuItemPublicCard item={item} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : (
          /* Traditional text layout — when no items have images */
          <TraditionalMenuLayout categories={categories} />
        )
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 h-px w-12 bg-border" />
            <p className="text-lg font-light tracking-wide text-muted-foreground">
              Menu coming soon
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground/70">
              We&rsquo;re preparing a curated dining experience for you.
              Check back shortly.
            </p>
          </div>
        </section>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes menuHeroFade {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes menuCardIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
