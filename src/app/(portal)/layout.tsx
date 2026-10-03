import { UnsavedChangesProvider } from "@/components/providers/unsaved-changes-provider"
import { PortalThemeProvider } from "@/components/providers/portal-theme-provider"
import { requireAuth } from '@/lib/auth/guards'
import { AuthProvider } from '@/components/providers/auth-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from 'sonner'
import { redirect } from 'next/navigation'
import { getEnabledClientModules } from '@/lib/client-release/modules'
import { PwaProvider } from '@/components/pwa/pwa-provider'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireAuth()

  // If no profile found (user logged in via Google but not invited), show error
  if (!profile) {
    redirect('/login?error=no_profile')
  }

  return (
    <AuthProvider
      initialProfile={profile}
      enabledModules={[...getEnabledClientModules()]}
    >
      <PortalThemeProvider>
      <UnsavedChangesProvider><PwaProvider>
        <SidebarProvider className="portal-theme">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <Header />
            <main data-portal-main className="relative min-w-0 flex-1 p-4 sm:p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="top-right" className="portal-theme" toastOptions={{ className: "portal-toast" }} />
      </PwaProvider></UnsavedChangesProvider>
      </PortalThemeProvider>
    </AuthProvider>
  )
}
