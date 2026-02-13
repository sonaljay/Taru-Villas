import { Toaster } from 'sonner'
import Image from 'next/image'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-center py-4 px-4">
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
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
      <Toaster position="top-right" />
    </div>
  )
}
