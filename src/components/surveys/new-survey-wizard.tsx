'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { SurveyForm } from '@/components/surveys/survey-form'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface Template {
  id: string
  name: string
  description: string | null
  surveyType: 'internal' | 'guest'
}

interface Property {
  id: string
  name: string
}

interface NewSurveyWizardProps {
  templates: Template[]
  properties: Property[]
}

interface TemplateData {
  id: string
  name: string
  categories: {
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
  }[]
}

export function NewSurveyWizard({
  templates,
  properties,
}: NewSurveyWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [surveyType, setSurveyType] = useState<'internal' | 'guest'>('internal')
  const [templateId, setTemplateId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [visitDate, setVisitDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [templateData, setTemplateData] = useState<TemplateData | null>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)

  // Filter templates by selected survey type
  const filteredTemplates = useMemo(
    () => templates.filter((t) => t.surveyType === surveyType),
    [templates, surveyType]
  )

  // Reset template selection when type changes
  function handleSurveyTypeChange(type: 'internal' | 'guest') {
    setSurveyType(type)
    setTemplateId('')
  }

  async function handleNext() {
    if (!templateId) {
      toast.error('Please select a template')
      return
    }
    if (!propertyId) {
      toast.error('Please select a property')
      return
    }
    if (!visitDate) {
      toast.error('Please enter a visit date')
      return
    }

    // Fetch full template data
    setIsLoadingTemplate(true)
    try {
      const res = await fetch(`/api/templates/${templateId}`)
      if (!res.ok) throw new Error('Failed to fetch template')
      const data = await res.json()
      setTemplateData(data)
      setStep(2)
    } catch (error) {
      toast.error('Failed to load template. Please try again.')
    } finally {
      setIsLoadingTemplate(false)
    }
  }

  if (step === 2 && templateData) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
          <ArrowLeft className="size-4" />
          Back to Setup
        </Button>

        <SurveyForm
          templateId={templateId}
          propertyId={propertyId}
          visitDate={visitDate}
          categories={templateData.categories}
        />
      </div>
    )
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Survey Setup</CardTitle>
        <CardDescription>
          Select the survey type, template, property, and visit date for this assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Survey Type */}
        <div className="space-y-2">
          <Label>Survey Type</Label>
          <Select value={surveyType} onValueChange={(v) => handleSurveyTypeChange(v as 'internal' | 'guest')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Internal Assessment</SelectItem>
              <SelectItem value="guest">Guest Survey</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Template */}
        <div className="space-y-2">
          <Label>Survey Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent>
              {filteredTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filteredTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active {surveyType} templates available. Ask your administrator to create
              one.
            </p>
          )}
        </div>

        {/* Property */}
        <div className="space-y-2">
          <Label>Property</Label>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {properties.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No properties assigned to you. Contact your administrator.
            </p>
          )}
        </div>

        {/* Visit Date */}
        <div className="space-y-2">
          <Label>Visit Date</Label>
          <Input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
          />
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button
            onClick={handleNext}
            disabled={!templateId || !propertyId || !visitDate || isLoadingTemplate}
          >
            {isLoadingTemplate ? 'Loading...' : 'Next'}
            {!isLoadingTemplate && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
