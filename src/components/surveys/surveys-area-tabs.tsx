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
      className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      {visibleTabs.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-colors',
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
