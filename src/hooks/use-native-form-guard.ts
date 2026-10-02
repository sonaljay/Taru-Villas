'use client'
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { useUnsavedChanges } from './use-unsaved-changes'

function snapshot(form: HTMLFormElement) {
  return JSON.stringify([...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')].map(control => {
    if (control instanceof HTMLInputElement) {
      if (['checkbox', 'radio'].includes(control.type)) return control.checked
      if (control.type === 'file') return [...(control.files ?? [])].map(file => [file.name, file.size, file.lastModified])
    }
    return control.value
  }).concat([...form.querySelectorAll<HTMLElement>('[role="combobox"], [role="checkbox"], [role="switch"]')].map(control => `${control.textContent}:${control.getAttribute('aria-checked')}`)))
}
/** Tracks native form edits in memory. Only the owner can confirm a successful save. */
export function useNativeFormGuard() {
  const baselines = useRef(new Map<HTMLFormElement, string>()), submitted = useRef<HTMLFormElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const { markSaved: clearRegistration } = useUnsavedChanges(dirty)
  const check = useCallback(() => {
    for (const form of baselines.current.keys()) if (!form.isConnected) baselines.current.delete(form)
    setDirty([...baselines.current].some(([form, value]) => snapshot(form) !== value))
  }, [])
  const remember = (form: HTMLFormElement) => {
    if (!baselines.current.has(form)) baselines.current.set(form, snapshot(form))
  }
  const markSaved = (savedForm?: HTMLFormElement | null) => {
    const form = savedForm ?? submitted.current
    if (form) baselines.current.delete(form)
    submitted.current = null
    check()
    if (![...baselines.current].some(([entry, value]) => entry.isConnected && snapshot(entry) !== value)) clearRegistration()
  }
  useEffect(() => {
    if (!dirty) return
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [dirty, check])
  const formProps: Pick<ComponentProps<'form'>, 'onFocusCapture' | 'onPointerDownCapture' | 'onChangeCapture' | 'onClickCapture' | 'onSubmitCapture'> = {
    onFocusCapture: event => remember(event.currentTarget),
    onPointerDownCapture: event => remember(event.currentTarget),
    onChangeCapture: () => check(),
    onClickCapture: () => requestAnimationFrame(check),
    onSubmitCapture: event => { submitted.current = event.currentTarget },
  }
  return { formProps, markSaved, dirty }
}
