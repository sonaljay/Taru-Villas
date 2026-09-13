import { describe, expect, it } from 'vitest'
import { getBuildModuleEnvironment } from './build-policy'

describe('deployment profile', () => {
  it('keeps development builds unrestricted', () => {
    expect(getBuildModuleEnvironment('development')).toEqual({})
  })
  it('pins release builds to the approved modules', () => {
    expect(getBuildModuleEnvironment('taru-release')).toEqual({
      CLIENT_ENABLED_MODULES: 'dashboard,tasks,fleet,daily-records',
    })
  })
  it('rejects an unknown profile instead of releasing unrestricted features', () => {
    expect(() => getBuildModuleEnvironment('typo')).toThrow('Unknown deployment profile')
  })
})
