'use client'
import { createContext, useContext, type ReactNode } from 'react'
const PortalThemeContext = createContext(false)
export function PortalThemeProvider({ children }: { children: ReactNode }) {
  return <PortalThemeContext.Provider value={true}>{children}</PortalThemeContext.Provider>
}
export function usePortalThemeClassName(): 'portal-theme' | undefined {
  return useContext(PortalThemeContext) ? 'portal-theme' : undefined
}
