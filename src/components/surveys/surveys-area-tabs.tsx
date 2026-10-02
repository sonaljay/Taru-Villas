'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'

interface Tab {
  label: string
  href: string
  match: (pathname: string) => boolean
  adminOnly?: boolean
}

const tabs: Tab[] = [
  {
    label: 'Submissions',
    href: '/surveys',
    match: (p) => p === '/surveys' || p.startsWith('/surveys/') && !p.startsWith('/surveys/templates'),
  },
  {
    label: 'Templates',
    href: '/surveys/templates',
    match: (p) => p.startsWith('/surveys/templates'),
    adminOnly: true,
  },
]

export function SurveysAreaTabs() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const isAdmin = profile.role === 'admin'

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin)
  if (visibleTabs.length <= 1) return null

  return (
    <nav
      aria-label="Surveys sections"
      className="inline-flex min-h-12 max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      {visibleTabs.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center justify-center min-h-11 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground/60 hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
