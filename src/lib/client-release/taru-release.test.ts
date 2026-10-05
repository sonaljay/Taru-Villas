import { describe, expect, it } from 'vitest'
import config from '../../../next.config'
import deploymentProfile from '../../../deployment-profile.json'
import { getClientModuleRequestStatus, getEnabledClientModules, isPathEnabled, moduleForPath } from './modules'

const modules = 'dashboard,tasks,fleet,daily-records,guest-profiles,sales-marketing,guest-portal,menus,excursions'

describe('Taru release', () => {
  it('applies the checked-in deployment profile to the build', () => {
    expect(config.env?.CLIENT_ENABLED_MODULES).toBe(
      deploymentProfile.profile === 'taru-release' ? modules : undefined
    )
  })

  it.each([
    '/dashboard', '/tasks', '/api/projects', '/api/issues',
    '/fleet', '/fleet/dispatch', '/admin/fleet/vehicles', '/admin/fleet/drivers',
    '/admin/fleet/distances', '/api/fleet/requests', '/d/example',
    '/api/cron/fleet-optimize', '/api/cron/vehicle-renewals',
    '/admin/fleet/visit-report-categories', '/api/fleet/visit-report-categories',
    '/fleet/my-rides', '/daily-records',
    '/properties/example/daily-records', '/api/utilities/readings',
    '/api/utilities/summary', '/api/utilities/extract-reading',
    '/api/waste', '/api/cron/electricity-autofill',
    '/admin/users', '/admin/properties', '/api/auth/provision',
    '/login', '/callback', '/set-password', '/menus', '/m/example', '/excursions', '/e/example', '/properties/example/menus',
    '/guest-profiles', '/api/guest-profiles/sync', '/api/oracle/test-connection', '/api/cron/guest-profiles-sync', '/properties/example/guest-profiles',
  ])('keeps the required route accessible: %s', (path) => {
    expect(getClientModuleRequestStatus(path, modules)).toBeNull()
  })

  it.each([
    '/surveys', '/api/surveys', '/api/templates', '/g/example',
    '/sops', '/api/sops/templates', '/rostering', '/api/rostering/cycles',
    '/assets', '/api/assets',
    '/settings',
    '/admin/allowed-emails', '/utilities', '/u/example', '/api/utilities/public',
  ])('blocks excluded modules at their routes: %s', (path) => {
    expect(getClientModuleRequestStatus(path, modules)).toBe(404)
    expect(isPathEnabled(path, getEnabledClientModules(modules))).toBe(false)
  })
})

describe('LO full portal release policy',()=>{
 const finalModules='dashboard,tasks,fleet,daily-records,guest-profiles,sales-marketing,guest-portal,menus,excursions'
 it('pins the final approved product modules',()=>{expect(config.env?.CLIENT_ENABLED_MODULES).toBe(finalModules)})
 it.each(['/stay/example','/api/guest-portal/example/requests','/api/guest-portal/example/questionnaire','/api/guest-portal/example/uploads','/api/guest-profiles/requests','/api/guest-profiles/questions','/api/guest-profiles/example/link','/api/guest-profiles/example/email','/api/guest-profiles/email-settings','/api/cron/guest-portal','/menus','/api/menus/items/example','/excursions','/api/excursions/example'])('explicitly maps and allows %s',path=>{expect(moduleForPath(path)).toBeDefined();expect(getClientModuleRequestStatus(path,finalModules)).toBeNull()})
 it('maps the email worker to the guest portal gate',()=>{expect(moduleForPath('/api/cron/guest-portal')).toBe('guest-portal');expect(moduleForPath('/api/guest-profiles/email-settings')).toBe('guest-portal');expect(moduleForPath('/api/guest-profiles/example/link')).toBe('guest-portal')})
 it.each(['/surveys','/sops','/rostering','/assets','/utilities','/u/example','/g/example'])('keeps %s disabled',path=>expect(getClientModuleRequestStatus(path,finalModules)).toBe(404))
 it.each(['/staying/example','/api/guest-portals/example','/api/cron/guest-portals'])('does not capture near-prefix %s',path=>expect(moduleForPath(path)).toBeUndefined())
})
