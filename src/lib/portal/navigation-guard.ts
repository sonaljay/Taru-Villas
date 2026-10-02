export const historyKey = '__taruPortalHistoryIndex'
export const discardMessage = 'Leave this form? Your unsaved changes will be lost.'
export function isSameDocumentNavigation(current: string, destination: string) {
  const from = new URL(current), to = new URL(destination, current)
  return from.origin === to.origin && from.pathname === to.pathname && from.search === to.search
}
export function withHistoryIndex(state: unknown, index: number) {
  return { ...(state && typeof state === 'object' ? state as Record<string, unknown> : {}), [historyKey]: index }
}
export function restoreHistoryDelta(current: number, destination: unknown) {
  return typeof destination === 'number' ? current - destination : null
}
