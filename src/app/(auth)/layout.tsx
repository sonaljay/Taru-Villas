import { PortalThemeProvider } from "@/components/providers/portal-theme-provider"
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PortalThemeProvider><div className="portal-theme portal-auth min-h-screen flex items-center justify-center p-4">
      {children}
    </div></PortalThemeProvider>
  )
}
