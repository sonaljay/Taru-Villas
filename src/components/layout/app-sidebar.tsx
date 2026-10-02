'use client'

import { useUnsavedChangesNavigation } from '@/hooks/use-unsaved-changes'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, ChevronsUpDown, Settings } from 'lucide-react'

import { useAuth } from '@/components/providers/auth-provider'
import { getPortalNavigationGroups } from '@/lib/portal/navigation'
import { createClient } from '@/lib/supabase/client'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatRole(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { confirmNavigation } = useUnsavedChangesNavigation()
  const { profile, enabledModules } = useAuth()
  const { setOpenMobile } = useSidebar()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    if (href === '/sops') {
      return pathname === '/sops'
    }
    if (href === '/fleet') {
      return pathname === '/fleet'
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const handleSignOut = async () => {
    if (!confirmNavigation()) return
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navigationGroups = getPortalNavigationGroups({ profile, enabledModules })

  return (
    <Sidebar collapsible="icon">
      {/* ---- Brand Header ---- */}
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1.5 py-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E5EDDF]">
            <img
              src="/TVPL.png"
              alt="Taru Villas logo"
              className="size-6"
            />
          </div>
          <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-serif text-xl tracking-tight">Taru Villas</span>
            <span className="text-sm text-muted-foreground">
              Your work, made simpler
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {navigationGroups.map(group => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {group.items.map(item => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title} className="h-11 rounded-lg">
                    <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined} onClick={() => setOpenMobile(false)}>
                      <item.icon className="size-4" /><span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ---- Footer: User Info + Sign Out ---- */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar size="sm" className="size-8 rounded-lg">
                    {profile.avatarUrl && (
                      <AvatarImage
                        src={profile.avatarUrl}
                        alt={profile.fullName}
                      />
                    )}
                    <AvatarFallback className="rounded-lg text-xs">
                      {getInitials(profile.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {profile.fullName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {profile.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar size="sm" className="size-8 rounded-lg">
                      {profile.avatarUrl && (
                        <AvatarImage
                          src={profile.avatarUrl}
                          alt={profile.fullName}
                        />
                      )}
                      <AvatarFallback className="rounded-lg text-xs">
                        {getInitials(profile.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {profile.fullName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {profile.email}
                      </span>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {formatRole(profile.role)}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {navigationGroups.some(group => group.items.some(item => item.href === '/settings')) && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" onClick={() => setOpenMobile(false)}>
                        <Settings className="size-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
