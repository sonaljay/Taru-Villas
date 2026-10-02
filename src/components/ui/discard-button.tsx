'use client'
import type { ComponentProps } from 'react'
import { Button } from './button'
import { useUnsavedChangesNavigation } from '@/hooks/use-unsaved-changes'
/** Explicit Cancel handlers do not pass through Radix's dismissal callback. */
export function DiscardButton({ onClick, type = 'button', ...props }: ComponentProps<typeof Button>) {
  const { confirmNavigation } = useUnsavedChangesNavigation()
  return <Button {...props} type={type} onClick={event => {
    if (!confirmNavigation()) { event.preventDefault(); event.stopPropagation(); return }
    onClick?.(event)
  }} />
}
