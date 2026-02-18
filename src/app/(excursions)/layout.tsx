import { Toaster } from 'sonner'
import Image from 'next/image'

export default function ExcursionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-center py-4 px-4">
          <Image
            src="/TVPL.png"
            alt="Taru Villas"
            width={140}
            height={40}
            className="h-10 w-auto"
            priority
          />
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t bg-card mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Curated by Taru Villas &middot; Boutique hospitality in Sri Lanka
          </p>
        </div>
      </footer>
      <Toaster position="top-right" />
    </div>
  )
}
