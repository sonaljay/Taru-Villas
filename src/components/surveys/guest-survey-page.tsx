'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SurveyForm } from './survey-form'

interface Category {
  id: string
  name: string
  weight: string
  sortOrder: number
  subcategories: {
    id: string
    name: string
    sortOrder: number
    questions: {
      id: string
      text: string
      description: string | null
      scaleMin: number
      scaleMax: number
      isRequired: boolean
      sortOrder: number
    }[]
  }[]
}

interface GuestSurveyPageProps {
  token: string
  propertyName: string
  templateName: string
  categories: Category[]
}

export function GuestSurveyPage({
  token,
  propertyName,
  templateName,
  categories,
}: GuestSurveyPageProps) {
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleGuestSubmit(
    responses: { questionId: string; score: number; note?: string }[]
  ) {
    const res = await fetch('/api/surveys/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        guestName: guestName || undefined,
        guestEmail: guestEmail || undefined,
        responses,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to submit survey')
    }

    setSubmitted(true)
    toast.success('Thank you for your feedback!')
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="size-16 text-emerald-500 mb-4" />
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Thank You!
        </h1>
        <p className="text-muted-foreground max-w-sm">
          Your feedback for {propertyName} has been submitted successfully.
          We appreciate you taking the time to share your experience.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{propertyName}</h1>
        <p className="text-muted-foreground">{templateName}</p>
      </div>

      {/* Optional guest info */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Optionally provide your details so we can follow up if needed.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="guest-name">Name</Label>
            <Input
              id="guest-name"
              placeholder="Your name (optional)"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-email">Email</Label>
            <Input
              id="guest-email"
              type="email"
              placeholder="your@email.com (optional)"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Survey form */}
      <SurveyForm
        templateId=""
        propertyId=""
        visitDate=""
        categories={categories}
        surveyType="guest"
        isGuest
        onGuestSubmit={handleGuestSubmit}
      />
    </div>
  )
}
