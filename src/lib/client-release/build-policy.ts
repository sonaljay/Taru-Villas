// Keep feature code shared; only deployment-profile.json differs on release.
export function getBuildModuleEnvironment(profile: string): Record<string, string> {
  if (profile === 'development') return {}
  if (profile === 'taru-release') {
    return { CLIENT_ENABLED_MODULES: 'dashboard,tasks,fleet,daily-records' }
  }
  throw new Error(`Unknown deployment profile: ${profile}`)
}
