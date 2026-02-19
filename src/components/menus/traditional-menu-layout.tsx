'use client'

import type { MenuCategoryWithItems } from '@/lib/db/queries/menus'

interface TraditionalMenuLayoutProps {
  categories: MenuCategoryWithItems[]
}

function getTagStyle(tag: string): string {
  const lower = tag.toLowerCase()

  if (lower === 'spicy' || lower === 'hot' || lower === 'extra spicy')
    return 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300'

  if (lower === 'vegetarian' || lower === 'vegan' || lower === 'plant-based')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'

  if (lower === 'new' || lower === 'seasonal')
    return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'

  if (
    lower === "chef's special" ||
    lower === 'signature' ||
    lower === 'recommended' ||
    lower === 'popular'
  )
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'

  if (
    lower === 'gluten-free' ||
    lower === 'dairy-free' ||
    lower === 'nut-free' ||
    lower === 'halal'
  )
    return 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'

  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

export function TraditionalMenuLayout({
  categories,
}: TraditionalMenuLayoutProps) {
  let globalIndex = 0

  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <div className="space-y-12">
        {categories.map((category, catIndex) => (
          <div
            key={category.id}
            style={{
              animation: 'menuHeroFade 0.6s ease-out both',
              animationDelay: `${catIndex * 150}ms`,
            }}
          >
            {/* Ornamental divider */}
            {catIndex > 0 && (
              <div className="flex items-center justify-center gap-3 mb-12">
                <div className="h-px w-16 bg-border" />
                <span className="text-xs text-muted-foreground/50 select-none">&#9830;</span>
                <div className="h-px w-16 bg-border" />
              </div>
            )}

            {/* Category heading */}
            <div className="text-center mb-8">
              <h2
                className="text-2xl font-light tracking-wide text-foreground/90 sm:text-3xl"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {category.name}
              </h2>
              {category.description && (
                <p className="mt-2 text-sm italic text-muted-foreground max-w-md mx-auto">
                  {category.description}
                </p>
              )}
              <div className="mt-4 mx-auto h-px w-12 bg-foreground/15" />
            </div>

            {/* Menu items */}
            <div className="space-y-5">
              {category.menuItems.map((item) => {
                const idx = globalIndex++
                return (
                  <div
                    key={item.id}
                    style={{
                      animation: 'menuCardIn 0.5s ease-out both',
                      animationDelay: `${idx * 60 + catIndex * 150}ms`,
                    }}
                  >
                    {/* Name row with dotted leader + price */}
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-base font-medium text-foreground shrink-0"
                        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                      >
                        {item.title}
                      </span>
                      <span className="flex-1 border-b border-dotted border-foreground/15 translate-y-[-3px]" />
                      {item.price && (
                        <span className="text-sm font-medium text-foreground/80 shrink-0 tabular-nums">
                          {item.price}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="mt-1 text-sm italic leading-relaxed text-muted-foreground/80">
                        {item.description}
                      </p>
                    )}

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getTagStyle(tag)}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom ornamental flourish */}
      <div className="mt-16 flex items-center justify-center gap-3">
        <div className="h-px w-12 bg-border" />
        <span className="text-xs text-muted-foreground/40 select-none">&#9830; &#9830; &#9830;</span>
        <div className="h-px w-12 bg-border" />
      </div>
    </section>
  )
}
