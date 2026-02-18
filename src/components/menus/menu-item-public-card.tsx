'use client'

import { Badge } from '@/components/ui/badge'
import type { MenuItem } from '@/lib/db/schema'

interface MenuItemPublicCardProps {
  item: MenuItem
}

/**
 * Maps common food-related tags to a color scheme.
 * Returns Tailwind classes for background + text.
 */
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

export function MenuItemPublicCard({ item }: MenuItemPublicCardProps) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5">
      {/* Image area — 4:3 aspect */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/40">
            <span className="text-5xl opacity-60 transition-transform duration-300 group-hover:scale-110">
              🍽
            </span>
          </div>
        )}

        {/* Price pill — floats over bottom-left of image */}
        {item.price && (
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-white/95 text-zinc-900 shadow-sm backdrop-blur-sm hover:bg-white/95 border-0 text-xs font-semibold tracking-wide">
              {item.price}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold leading-snug tracking-tight">
          {item.title}
        </h3>

        {item.description && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getTagStyle(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
