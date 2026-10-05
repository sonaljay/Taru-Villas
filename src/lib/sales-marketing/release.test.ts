import { describe, expect, it } from 'vitest'
import { moduleForPath, getClientModuleRequestStatus } from '@/lib/client-release/modules'
import { getBuildModuleEnvironment } from '@/lib/client-release/build-policy'
describe('sales route release policy', () => {
  it('maps reporting routes and applies the approved release policy', () => {
    for (const path of ['/sales-marketing', '/api/sales-marketing']) {
      expect(moduleForPath(path)).toBe('sales-marketing')
      expect(getClientModuleRequestStatus(path, getBuildModuleEnvironment('taru-release').CLIENT_ENABLED_MODULES)).toBeNull()
      expect(getClientModuleRequestStatus(path, 'tasks')).toBe(404)
    }
    expect(moduleForPath('/api/sales-marketing-other')).toBeUndefined()
    expect(getClientModuleRequestStatus('/surveys', getBuildModuleEnvironment('taru-release').CLIENT_ENABLED_MODULES)).toBe(404)
  })
})
