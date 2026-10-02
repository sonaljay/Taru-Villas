import { expect, it } from 'vitest'
import { getPortalNavigationGroups } from './navigation'
import type { ClientModule } from '@/lib/client-release/modules'

const paths = (role: 'admin' | 'property_manager' | 'staff', modules: string[] = [], fleet = false, booker = false) =>
    getPortalNavigationGroups({ profile: { role, isFleetAdmin: fleet, canBookFleet: booker }, enabledModules: modules as ClientModule[] })
    .flatMap(group => group.items.map(item => item.href))

it('keeps staff personal rides without offering fleet administration', () => {
  expect(paths('staff', ['tasks', 'fleet'])).toContain('/fleet/my-rides')
  expect(paths('staff', ['tasks', 'fleet'])).not.toContain('/dashboard')
  expect(paths('staff', ['tasks', 'fleet'])).not.toContain('/fleet/dispatch')
  expect(paths('staff', ['tasks', 'fleet'])).not.toContain('/admin/users')
  expect(paths('staff', ['tasks', 'fleet'])).not.toContain('/surveys')
})
it('preserves administration and unrestricted modules for admins', () => {
  expect(paths('admin')).toEqual(expect.arrayContaining(['/dashboard', '/tasks', '/sops', '/admin/users', '/admin/fleet/vehicles', '/guest-profiles']))
})
it('allows bookings without fleet configuration', () => {
  expect(paths('property_manager', ['fleet'], false, true)).toContain('/fleet')
  expect(paths('property_manager', ['fleet'], false, true)).not.toContain('/admin/fleet/drivers')
})
it('supports fleet-admin staff without general admin privileges', () => {
  expect(paths('staff', ['fleet'], true)).toContain('/admin/fleet/vehicles')
  expect(paths('staff', ['fleet'], true)).not.toContain('/admin/users')
})
it('omits empty groups and never duplicates a route', () => {
  const groups = getPortalNavigationGroups({ profile: { role: 'staff', isFleetAdmin: false, canBookFleet: false }, enabledModules: ['tasks'] })
  expect(groups.every(group => group.items.length)).toBe(true)
  const items = groups.flatMap(group => group.items.map(item => item.href))
  expect(new Set(items).size).toBe(items.length)
})
it('respects both configured release module lists for every role', () => {
  for (const role of ['admin', 'property_manager', 'staff'] as const) {
    const client = paths(role, ['dashboard', 'tasks', 'surveys', 'fleet'])
    expect(client).toContain('/surveys')
    expect(client).not.toContain('/daily-records')
    expect(client).not.toContain('/rostering')
    const taru = paths(role, ['dashboard', 'tasks', 'fleet', 'daily-records'])
    expect(taru).toContain('/daily-records')
    expect(taru).not.toContain('/surveys')
    expect(taru).not.toContain('/assets')
    expect(taru).not.toContain('/sops')
  }
})
