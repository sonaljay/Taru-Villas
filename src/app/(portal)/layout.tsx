import { requireAuth } from '@/lib/auth/guards'
import { AuthProvider } from '@/components/providers/auth-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from 'sonner'
import { redirect } from 'next/navigation'

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
    <AuthProvider initialProfile={profile}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="top-right" />
    </AuthProvider>
  )
}
