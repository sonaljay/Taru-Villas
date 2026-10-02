'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { discardMessage, historyKey, isSameDocumentNavigation, restoreHistoryDelta, withHistoryIndex } from '@/lib/portal/navigation-guard'

type GuardContextValue = {
  setDirty(id: symbol, dirty: boolean): void
  setBusy(id: symbol, busy: boolean): void
  remove(id: symbol): void
  confirmNavigation(): boolean
}
const inert: GuardContextValue = { setDirty: () => {}, setBusy: () => {}, remove: () => {}, confirmNavigation: () => true }
const GuardContext = createContext(inert)
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const savingEntries = useRef(new Map<symbol, boolean>())
  const entries = useRef(new Map<symbol, boolean>())
  const setDirty = useCallback((id: symbol, dirty: boolean) => { entries.current.set(id, dirty) }, [])
  const setBusy = useCallback((id: symbol, busy: boolean) => { savingEntries.current.set(id, busy) }, [])
  const remove = useCallback((id: symbol) => { entries.current.delete(id); savingEntries.current.delete(id) }, [])
  const confirmNavigation = useCallback(() => ![...savingEntries.current.values()].some(Boolean) && (![...entries.current.values()].some(Boolean) || window.confirm(discardMessage)), [])
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (![...entries.current.values()].some(Boolean) && ![...savingEntries.current.values()].some(Boolean)) return
      event.preventDefault(); event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== '_self')) return
      const destination = new URL(anchor.href, location.href)
      if (!['http:', 'https:'].includes(destination.protocol) || isSameDocumentNavigation(location.href, anchor.href)) return
      if (!confirmNavigation()) { event.preventDefault(); event.stopImmediatePropagation() }
    }
    // Preserve Next's state object while adding a position to entries created here.
    const originalPush = history.pushState, originalReplace = history.replaceState
    let index = typeof history.state?.[historyKey] === 'number' ? history.state[historyKey] : 0
    let recorded = { state: withHistoryIndex(history.state, index), url: location.href }
    let restoring = false
    originalReplace.call(history, recorded.state, '', recorded.url)
    history.pushState = function(state, unused, url) {
      index += 1
      originalPush.call(this, withHistoryIndex(state, index), unused, url)
      recorded = { state: history.state, url: location.href }
    }
    history.replaceState = function(state, unused, url) {
      originalReplace.call(this, withHistoryIndex(state, index), unused, url)
      recorded = { state: history.state, url: location.href }
    }
    const onPop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return }
      const destination = event.state?.[historyKey]
      if (confirmNavigation()) {
        index = typeof destination === 'number' ? destination : index + 1
        recorded = { state: withHistoryIndex(event.state, index), url: location.href }
        originalReplace.call(history, recorded.state, '', recorded.url)
        return
      }
      event.stopImmediatePropagation()
      const delta = restoreHistoryDelta(index, destination)
      if (delta !== null && delta !== 0) { restoring = true; history.go(delta) }
      else originalPush.call(history, recorded.state, '', recorded.url)
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPop, true)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPop, true)
      history.pushState = originalPush; history.replaceState = originalReplace
    }
  }, [confirmNavigation])
  const value = useMemo(() => ({ setDirty, setBusy, remove, confirmNavigation }), [setDirty, setBusy, remove, confirmNavigation])
  return <GuardContext.Provider value={value}>{children}</GuardContext.Provider>
}
export function useUnsavedChanges(isDirty: boolean, isSaving = false) {
  const context = useContext(GuardContext), id = useRef(Symbol('form'))
  const { setBusy, setDirty, remove } = context
  useEffect(() => { setBusy(id.current, isSaving) }, [setBusy, isSaving])
  useEffect(() => { setDirty(id.current, isDirty) }, [setDirty, isDirty])
  useEffect(() => { const registration = id.current; return () => remove(registration) }, [remove])
  const markSaved = useCallback(() => { setDirty(id.current, false); setBusy(id.current, false) }, [setDirty, setBusy])
  return { markSaved, confirmDiscard: () => context === inert || (!isSaving && (!isDirty || window.confirm(discardMessage))) }
}
export function useSaveProtection(isSaving: boolean) { return useUnsavedChanges(false, isSaving).markSaved }
export function useUnsavedChangesNavigation() {
  const { confirmNavigation } = useContext(GuardContext)
  return { confirmNavigation }
}
/** Guard imperative navigation in editing workspaces as well as ordinary links. */
export function usePortalRouter() {
  const router = useRouter(), { confirmNavigation } = useUnsavedChangesNavigation()
  return { ...router,
    push: (...args: Parameters<typeof router.push>) => { if (confirmNavigation()) router.push(...args) },
    replace: (...args: Parameters<typeof router.replace>) => { if (confirmNavigation()) router.replace(...args) },
    back: () => router.back(),
  }
}
