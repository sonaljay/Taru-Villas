'use client'
import { useState, type ComponentProps } from 'react'
import { useUnsavedChangesNavigation } from '@/hooks/use-unsaved-changes'
import { Tabs } from './tabs'

/** Workspace tabs replace their editing panel, so confirm before unmounting it. */
export function GuardedTabs({ value, defaultValue, onValueChange, ...props }: ComponentProps<typeof Tabs>) {
  const [selected, setSelected] = useState(defaultValue)
  const { confirmNavigation } = useUnsavedChangesNavigation()
  return <Tabs activationMode="manual" {...props} value={value ?? selected} onValueChange={next => {
    if (!confirmNavigation()) return
    setSelected(next)
    onValueChange?.(next)
  }} />
}
