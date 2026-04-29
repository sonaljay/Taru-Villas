'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export function OtaRefreshButton({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function refresh() {
    setError(null)
    const res = await fetch(`/api/admin/ota/sync/${propertyId}`, { method: 'POST' })
    if (!res.ok) {
      setError(`Failed: ${res.status}`)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={refresh} disabled={pending}>
        <RefreshCw className={pending ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'} />
        Refresh now
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
