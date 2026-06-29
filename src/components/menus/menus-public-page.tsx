'use client'

import { useState } from 'react'
import { MapPin, UtensilsCrossed, ChefHat, ArrowLeft } from 'lucide-react'
import { TraditionalMenuLayout, MenuCategoryList } from '@/components/menus/traditional-menu-layout'
import type { Property } from '@/lib/db/schema'
import type { MenuWithCategories } from '@/lib/db/queries/menus'

interface MenusPublicPageProps {
  property: Property
  setMenus: MenuWithCategories[]
  aLaCarte: MenuWithCategories | null
  todayDow: number
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type View = 'select' | 'set' | 'alacarte'

export function MenusPublicPage({
  property,
  setMenus,
  aLaCarte,
  todayDow,
}: MenusPublicPageProps) {
  const heroImage = property.menuCoverImageUrl || property.imageUrl
  const hasSet = setMenus.length > 0
  const hasALaCarte = !!aLaCarte && aLaCarte.categories.some((c) => c.menuItems.length > 0)

  // Default selected set-menu day: today if it exists, else the first available.
  const todayMenu = setMenus.find((m) => m.dayOfWeek === todayDow)
  const [view, setView] = useState<View>('select')
  const [selectedDow, setSelectedDow] = useState<number>(
    todayMenu ? todayDow : (setMenus[0]?.dayOfWeek ?? todayDow)
  )

  const activeSet = setMenus.find((m) => m.dayOfWeek === selectedDow) ?? null

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        {heroImage ? (
          <>
            <img src={heroImage} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-950" />
        )}
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="mb-6 h-px w-16 bg-white/40" />
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-white/70">Our Menu</p>
          <h1 className="text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl">{property.name}</h1>
          {property.location && (
            <div className="mt-5 flex items-center gap-2 text-white/70">
              <MapPin className="size-4" strokeWidth={1.5} />
              <span className="text-sm tracking-wide">{property.location}</span>
            </div>
          )}
        </div>
      </section>

      {/* Body */}
      {!hasSet && !hasALaCarte ? (
        <ComingSoon />
      ) : view === 'select' ? (
        <SelectionScreen
          hasSet={hasSet}
          hasALaCarte={hasALaCarte}
          onPick={(v) => setView(v)}
        />
      ) : view === 'set' && activeSet ? (
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
          <BackBar onBack={() => setView('select')} other={hasALaCarte ? { label: 'Seven to Seven', go: () => setView('alacarte') } : null} />
          {/* Day switcher */}
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {setMenus.map((m) => {
              const dow = m.dayOfWeek ?? 0
              const isSel = dow === selectedDow
              const isToday = dow === todayDow
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedDow(dow)}
                  className={`relative rounded-full px-4 py-1.5 text-sm transition ${
                    isSel
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {DAY_LABELS[dow]}
                  {isToday && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">
                      tonight
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <SetMenuView menu={activeSet} />
        </div>
      ) : view === 'alacarte' && aLaCarte ? (
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
          <BackBar onBack={() => setView('select')} other={hasSet ? { label: 'Set Menu', go: () => setView('set') } : null} />
          {aLaCarte.footerNote && (
            <p className="mb-8 text-center text-xs italic text-muted-foreground">{aLaCarte.footerNote}</p>
          )}
          <TraditionalMenuLayout categories={aLaCarte.categories.filter((c) => c.menuItems.length > 0)} />
        </div>
      ) : (
        <ComingSoon />
      )}

    </>
  )
}

function BackBar({ onBack, other }: { onBack: () => void; other: { label: string; go: () => void } | null }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Menus
      </button>
      {other && (
        <button onClick={other.go} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {other.label} &rarr;
        </button>
      )}
    </div>
  )
}

function SelectionScreen({
  hasSet,
  hasALaCarte,
  onPick,
}: {
  hasSet: boolean
  hasALaCarte: boolean
  onPick: (v: View) => void
}) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="grid gap-6 sm:grid-cols-2">
        {hasSet && (
          <button
            onClick={() => onPick('set')}
            className="group flex flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center transition hover:shadow-lg"
          >
            <ChefHat className="size-10 text-foreground/70" strokeWidth={1.25} />
            <div>
              <h2 className="text-xl font-light tracking-wide">Set Menu</h2>
              <p className="mt-2 text-sm text-muted-foreground">Tonight&rsquo;s curated prix-fixe, changing daily.</p>
            </div>
          </button>
        )}
        {hasALaCarte && (
          <button
            onClick={() => onPick('alacarte')}
            className="group flex flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center transition hover:shadow-lg"
          >
            <UtensilsCrossed className="size-10 text-foreground/70" strokeWidth={1.25} />
            <div>
              <h2 className="text-xl font-light tracking-wide">Seven to Seven</h2>
              <p className="mt-2 text-sm text-muted-foreground">Our all-day à la carte selection.</p>
            </div>
          </button>
        )}
      </div>
    </section>
  )
}

function SetMenuView({ menu }: { menu: MenuWithCategories }) {
  const sections = menu.categories.filter((c) => c.menuItems.length > 0)
  // Convention: courses WITHOUT their own price note are part of the prix-fixe
  // set (priced together via the menu-level note). Courses WITH their own price
  // note (e.g. Chef's Special) are standalone, separately-priced options.
  const setCourses = sections.filter((c) => !c.priceNote?.trim())
  const standalone = sections.filter((c) => c.priceNote?.trim())
  const setItemCount = setCourses.reduce((n, c) => n + c.menuItems.length, 0)

  return (
    <div>
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-light tracking-wide" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {menu.name}
        </h2>
        {menu.description && (
          <p className="mx-auto mt-4 max-w-xl text-sm italic leading-relaxed text-muted-foreground">{menu.description}</p>
        )}
      </div>

      {/* Prix-fixe set: three courses priced together */}
      {setCourses.length > 0 && (
        <div>
          <div className="mb-10 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
              Three-Course Set Menu
            </p>
            {menu.priceNote && (
              <p className="mt-2 text-base font-medium text-foreground/80">{menu.priceNote}</p>
            )}
            <div className="mt-4 mx-auto h-px w-12 bg-foreground/15" />
          </div>
          <MenuCategoryList categories={setCourses} />
        </div>
      )}

      {/* Standalone, separately-priced options (e.g. Chef's Special) */}
      {standalone.length > 0 && (
        <div>
          {setCourses.length > 0 && (
            <div className="my-16 flex items-center justify-center gap-3">
              <div className="h-px w-12 bg-border" />
              <span className="text-xs text-muted-foreground/40 select-none">&#9830; &#9830; &#9830;</span>
              <div className="h-px w-12 bg-border" />
            </div>
          )}
          <MenuCategoryList categories={standalone} startIndex={setItemCount} />
        </div>
      )}

      {menu.footerNote && (
        <p className="mt-10 text-center text-xs italic text-muted-foreground">{menu.footerNote}</p>
      )}
    </div>
  )
}

function ComingSoon() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 h-px w-12 bg-border" />
        <p className="text-lg font-light tracking-wide text-muted-foreground">Menu coming soon</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground/70">
          We&rsquo;re preparing a curated dining experience for you. Check back shortly.
        </p>
      </div>
    </section>
  )
}
