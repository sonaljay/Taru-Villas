'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

interface Tab {
  label: string
  href: string
  match: (pathname: string) => boolean
}

interface TasksAreaTabsProps {
  isAdmin: boolean
}

export function TasksAreaTabs({ isAdmin }: TasksAreaTabsProps) {
  const pathname = usePathname()

  const tabs: Tab[] = [
    {
      label: 'Tasks',
      href: '/tasks',
      match: (p: string) => p === '/tasks',
    },
    ...(isAdmin
      ? [
          {
            label: 'Teams',
            href: '/tasks/teams',
            match: (p: string) => p.startsWith('/tasks/teams'),
          },
        ]
      : []),
  ]

  if (tabs.length <= 1) return null

  return (
    <nav
      aria-label="Tasks sections"
      className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      {tabs.map((tab) => {
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
