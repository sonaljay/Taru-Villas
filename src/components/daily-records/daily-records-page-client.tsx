'use client'

import { usePortalRouter } from '@/hooks/use-unsaved-changes'

import {  useSearchParams } from 'next/navigation'
import { ArrowLeft, Droplets, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UtilitiesPageClient } from '@/components/admin/utilities-page-client'
import { WastePageClient } from '@/components/waste/waste-page-client'
import { buildDailyRecordsPath, type DailyRecordTab } from '@/lib/daily-records/tabs'

interface DailyRecordsPageClientProps {
  property: { id: string; name: string; code: string; slug: string }
  isAdmin: boolean
  initialTab: DailyRecordTab
}

export function DailyRecordsPageClient({
  property,
  isAdmin,
  initialTab,
}: DailyRecordsPageClientProps) {
  const router = usePortalRouter()
  const searchParams = useSearchParams()

  const handleTabChange = (tab: string) => {
    router.replace(buildDailyRecordsPath(property.id, tab, new URLSearchParams(searchParams.toString())))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to Daily Records" className="shrink-0" onClick={() => router.push('/daily-records')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Daily Records — {property.name}</h1>
          <p className="text-sm text-muted-foreground">
            Track water, electricity, and daily wastage records
          </p>
        </div>
      </div>

      <Tabs value={initialTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="water" className="gap-1 px-2 sm:gap-2 sm:px-3">
            <Droplets className="hidden size-4 min-[400px]:block" />
            Water
          </TabsTrigger>
          <TabsTrigger value="electricity" className="gap-1 px-2 sm:gap-2 sm:px-3">
            <Zap className="hidden size-4 min-[400px]:block" />
            Electricity
          </TabsTrigger>
          <TabsTrigger value="waste" className="gap-1 px-2 sm:gap-2 sm:px-3">
            <Trash2 className="hidden size-4 min-[400px]:block" />
            <span className="sm:hidden">Wastage</span><span className="hidden sm:inline">Daily Wastage</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="water" className="mt-6">
          <UtilitiesPageClient
            property={property}
            isAdmin={isAdmin}
            initialUtilityType="water"
            showHeader={false}
            showUtilityTabs={false}
            embedded
          />
        </TabsContent>
        <TabsContent value="electricity" className="mt-6">
          <UtilitiesPageClient
            property={property}
            isAdmin={isAdmin}
            initialUtilityType="electricity"
            showHeader={false}
            showUtilityTabs={false}
            embedded
          />
        </TabsContent>
        <TabsContent value="waste" className="mt-6">
          <WastePageClient property={property} isAdmin={isAdmin} showHeader={false} embedded />
        </TabsContent>
      </Tabs>
    </div>
  )
}
