import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Your stay · Taru Villas', description: 'Your private stay companion', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f7f5ef] text-[#243b32] selection:bg-[#dbe5d8]"><header className="border-b border-[#243b32]/15 px-5 py-5 sm:px-10"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><span className="font-serif text-2xl tracking-[0.12em]">TARU VILLAS</span><span className="text-xs tracking-widest uppercase">Your stay</span></div></header>{children}<footer className="mx-auto max-w-6xl border-t border-[#243b32]/15 px-5 py-8 text-xs leading-relaxed text-[#243b32]/70">Your link is private. Share it only with people staying on your reservation.<br />Dining and experience requests are confirmed by our team.</footer></div>
}
