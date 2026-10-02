import { Building2, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, Compass, LayoutDashboard, ListChecks, ListTodo, Package, Settings, ShieldCheck, UserCheck, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { isPathEnabled, type ClientModule } from '@/lib/client-release/modules'
import { getFleetNavigationItems } from '@/lib/fleet/navigation'

interface NavigationItem { title: string; href: string; icon: LucideIcon }
export interface PortalNavigationGroup { title: string; items: NavigationItem[] }
interface NavigationProfile { role: string; isFleetAdmin: boolean; canBookFleet: boolean }

/** Organises the existing destinations; server guards remain the authority. */
export function getPortalNavigationGroups({ profile, enabledModules }: { profile: NavigationProfile; enabledModules: readonly ClientModule[] }): PortalNavigationGroup[] {
  const admin = profile.role === 'admin'
  const manager = admin || profile.role === 'property_manager'
  const enabled = new Set(enabledModules)
  const fleetAdmin = admin || profile.isFleetAdmin
  const fleet = isPathEnabled('/fleet', enabled) ? getFleetNavigationItems(profile.canBookFleet || fleetAdmin, fleetAdmin) : []
  const item = (title: string, href: string, icon: LucideIcon): NavigationItem => ({ title, href, icon })
  const groups: PortalNavigationGroup[] = [
    { title: 'Overview', items: admin ? [item('Dashboard', '/dashboard', LayoutDashboard)] : [] },
    { title: 'Daily work', items: [item('Tasks', '/tasks', ListTodo), item('Surveys', '/surveys', ClipboardCheck), item('SOPs', '/sops', ListChecks), item('Daily records', '/daily-records', ClipboardList), item('My roster', '/my-roster', CalendarDays)] },
    { title: 'Property operations', items: [item('Asset registry', '/assets', Package), ...(manager ? [item('Rostering', '/rostering', CalendarClock), item('Guest profiles', '/guest-profiles', UserCheck), item('Menus', '/menus', UtensilsCrossed), item('Excursions', '/excursions', Compass)] : [])] },
    { title: 'Transport', items: fleet.filter(entry => !entry.href.startsWith('/admin/')) },
    { title: 'Administration', items: [...(admin ? [item('Properties', '/admin/properties', Building2), item('Users', '/admin/users', Users), item('Allowed emails', '/admin/allowed-emails', ShieldCheck)] : []), ...fleet.filter(entry => entry.href.startsWith('/admin/'))] },
    { title: 'Account', items: [item('Settings', '/settings', Settings)] },
  ]
  return groups.map(group => ({ ...group, items: group.items.filter(entry => isPathEnabled(entry.href, enabled)) })).filter(group => group.items.length > 0)
}
