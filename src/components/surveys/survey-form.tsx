'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
  MessageSquare,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Question {
  id: string
  text: string
  description: string | null
  scaleMin: number
  scaleMax: number
  isRequired: boolean
  sortOrder: number
}

interface Subcategory {
  id: string
  name: string
  sortOrder: number
  questions: Question[]
}

interface Category {
  id: string
  name: string
  weight: string
  sortOrder: number
  subcategories: Subcategory[]
}

interface SurveyFormProps {
  templateId: string
  propertyId: string
  visitDate: string
  categories: Category[]
  /** Existing submission ID if editing a draft */
  submissionId?: string
  /** Pre-filled responses when editing a draft */
  existingResponses?: {
    questionId: string
    score: number
    note: string | null
  }[]
}

interface ResponseValue {
  score: number | null
  note: string
}

type FormValues = Record<string, ResponseValue>

interface FlatQuestion extends Question {
  categoryName: string
  subcategoryName: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyForm({
  templateId,
  propertyId,
  visitDate,
  categories,
  submissionId,
  existingResponses,
}: SurveyFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showNotes, setShowNotes] = useState<Set<string>>(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [animating, setAnimating] = useState(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentSubmissionId = useRef<string | undefined>(submissionId)

  // Flatten all questions sorted by category sortOrder -> subcategory sortOrder -> question sortOrder
  const flatQuestions: FlatQuestion[] = categories
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((c) =>
      (c.subcategories ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((sub) =>
          sub.questions
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((q) => ({
              ...q,
              categoryName: c.name,
              subcategoryName: sub.name,
            }))
        )
    )

  // Build default values
  const defaultValues: FormValues = {}
  for (const q of flatQuestions) {
    const existing = existingResponses?.find((r) => r.questionId === q.id)
    defaultValues[q.id] = {
      score: existing?.score ?? null,
      note: existing?.note ?? '',
    }
    if (existing?.note) {
      setShowNotes((prev) => new Set(prev).add(q.id))
    }
  }

  const { control, watch, getValues, setValue } = useForm<FormValues>({
    defaultValues,
  })

  const watchedValues = watch()

  // Count answered questions
  const totalQuestions = flatQuestions.length
  const answeredQuestions = Object.values(watchedValues).filter(
    (v) => v.score !== null && v.score !== undefined
  ).length

  const currentQuestion = flatQuestions[currentIndex]
  const isFirst = currentIndex === 0
  const isLast = currentIndex === flatQuestions.length - 1

  // Navigation
  function goTo(index: number, dir: 'next' | 'prev') {
    if (animating) return
    if (index < 0 || index >= flatQuestions.length) return
    setDirection(dir)
    setAnimating(true)
    setCurrentIndex(index)
    setTimeout(() => setAnimating(false), 400)
  }

  function goNext() {
    goTo(currentIndex + 1, 'next')
  }

  function goPrev() {
    goTo(currentIndex - 1, 'prev')
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        goPrev()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, animating])

  function toggleNote(questionId: string) {
    setShowNotes((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      return next
    })
  }

  // Auto-save draft every 30 seconds
  const saveDraft = useCallback(async () => {
    const values = getValues()
    const responses = Object.entries(values)
      .filter(([, v]) => v.score !== null && v.score !== undefined)
      .map(([questionId, v]) => ({
        questionId,
        score: v.score!,
        note: v.note || undefined,
      }))

    if (responses.length === 0) return

    try {
      if (currentSubmissionId.current) {
        await fetch(`/api/surveys/${currentSubmissionId.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitDate,
            responses,
          }),
        })
      } else {
        const res = await fetch('/api/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            propertyId,
            visitDate,
            status: 'draft',
            responses,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          currentSubmissionId.current = data.id
        }
      }
    } catch {
      // Silent fail for auto-save
    }
  }, [getValues, templateId, propertyId, visitDate])

  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      saveDraft()
    }, 30000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [saveDraft])

  async function handleSaveDraft() {
    setIsSaving(true)
    try {
      const values = getValues()
      const responses = Object.entries(values)
        .filter(([, v]) => v.score !== null && v.score !== undefined)
        .map(([questionId, v]) => ({
          questionId,
          score: v.score!,
          note: v.note || undefined,
        }))

      if (responses.length === 0) {
        toast.error('Please answer at least one question before saving')
        return
      }

      if (currentSubmissionId.current) {
        const res = await fetch(
          `/api/surveys/${currentSubmissionId.current}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitDate, responses }),
          }
        )
        if (!res.ok) throw new Error('Failed to save draft')
      } else {
        const res = await fetch('/api/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            propertyId,
            visitDate,
            status: 'draft',
            responses,
          }),
        })
        if (!res.ok) throw new Error('Failed to save draft')
        const data = await res.json()
        currentSubmissionId.current = data.id
      }

      toast.success('Draft saved successfully')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save draft'
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      const values = getValues()

      // Validate required questions
      const unansweredRequired = flatQuestions.filter(
        (q) =>
          q.isRequired &&
          (values[q.id]?.score === null || values[q.id]?.score === undefined)
      )

      if (unansweredRequired.length > 0) {
        toast.error(
          `Please answer all required questions. ${unansweredRequired.length} remaining.`
        )
        // Navigate to the first unanswered required question
        const firstIdx = flatQuestions.findIndex(
          (q) =>
            q.isRequired &&
            (values[q.id]?.score === null || values[q.id]?.score === undefined)
        )
        if (firstIdx >= 0) {
          goTo(firstIdx, firstIdx < currentIndex ? 'prev' : 'next')
        }
        return
      }

      const responses = Object.entries(values)
        .filter(([, v]) => v.score !== null && v.score !== undefined)
        .map(([questionId, v]) => ({
          questionId,
          score: v.score!,
          note: v.note || undefined,
        }))

      if (currentSubmissionId.current) {
        const patchRes = await fetch(
          `/api/surveys/${currentSubmissionId.current}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitDate, responses }),
          }
        )
        if (!patchRes.ok) throw new Error('Failed to update responses')

        const submitRes = await fetch(
          `/api/surveys/${currentSubmissionId.current}?action=submit`,
          { method: 'POST' }
        )
        if (!submitRes.ok) throw new Error('Failed to submit survey')
      } else {
        const res = await fetch('/api/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            propertyId,
            visitDate,
            status: 'submitted',
            responses,
          }),
        })
        if (!res.ok) throw new Error('Failed to submit survey')
      }

      toast.success('Survey submitted successfully')
      router.push('/surveys')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to submit survey'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!currentQuestion) {
    return <p className="text-muted-foreground">No questions in this template.</p>
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* 3D Card Wrapper */}
      <div className="w-full max-w-2xl" style={{ perspective: '1000px' }}>
        <div
          key={`${currentQuestion.id}-${currentIndex}`}
          className={cn(
            'rounded-xl border bg-card p-6 sm:p-8 shadow-lg',
            direction === 'next' ? 'card-enter-right' : 'card-enter-left'
          )}
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Header: category/subcategory badges + question counter */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {currentQuestion.categoryName}
              </span>
              {currentQuestion.subcategoryName && (
                <>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {currentQuestion.subcategoryName}
                  </span>
                </>
              )}
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              {currentIndex + 1} of {totalQuestions}
            </span>
          </div>

          {/* Question text */}
          <h2 className="text-lg sm:text-xl font-semibold leading-relaxed mb-2">
            {currentQuestion.text}
            {currentQuestion.isRequired && (
              <span className="text-destructive ml-1">*</span>
            )}
          </h2>

          {currentQuestion.description && (
            <p className="text-sm text-muted-foreground mb-6">
              {currentQuestion.description}
            </p>
          )}

          {!currentQuestion.description && <div className="mb-6" />}

          {/* Score buttons */}
          <ScoreButtons
            question={currentQuestion}
            control={control}
            value={watchedValues[currentQuestion.id]}
          />

          {/* Note toggle and field */}
          <div className="mt-6">
            {showNotes.has(currentQuestion.id) ? (
              <Controller
                control={control}
                name={`${currentQuestion.id}.note`}
                render={({ field }) => (
                  <Textarea
                    placeholder="Add a note..."
                    rows={3}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    className="text-sm"
                  />
                )}
              />
            ) : (
              <button
                type="button"
                onClick={() => toggleNote(currentQuestion.id)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageSquare className="size-4" />
                Add note
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation & actions */}
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={isFirst || animating}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>

          {isLast ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isSaving || isSubmitting}>
                  <Send className="size-4" />
                  {isSubmitting ? 'Submitting...' : 'Submit Survey'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit Survey</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to submit this survey? Once submitted,
                    you will not be able to make changes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit}>
                    Submit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button onClick={goNext} disabled={animating}>
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Save draft */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSaving || isSubmitting}
          >
            <Save className="size-4" />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </Button>
          <p className="text-sm text-muted-foreground">
            {answeredQuestions} of {totalQuestions} answered
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score buttons sub-component
// ---------------------------------------------------------------------------

interface ScoreButtonsProps {
  question: FlatQuestion
  control: ReturnType<typeof useForm<FormValues>>['control']
  value: ResponseValue | undefined
}

function ScoreButtons({ question, control, value }: ScoreButtonsProps) {
  const currentScore = value?.score

  function getButtonColor(score: number, isSelected: boolean) {
    // Color coding: 1-4 red, 5-7 amber, 8-10 green
    const range = question.scaleMax - question.scaleMin
    const normalized = range > 0
      ? ((score - question.scaleMin) / range) * 10
      : 5

    if (isSelected) {
      if (normalized <= 4) return 'bg-red-500 text-white border-red-500 hover:bg-red-600'
      if (normalized <= 7) return 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
      return 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
    }

    // Unselected — subtle border tint
    if (normalized <= 4) return 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'
    if (normalized <= 7) return 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950'
    return 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950'
  }

  const scores: number[] = []
  for (let i = question.scaleMin; i <= question.scaleMax; i++) {
    scores.push(i)
  }

  return (
    <Controller
      control={control}
      name={`${question.id}.score`}
      render={({ field }) => (
        <div className="flex flex-wrap justify-center gap-2">
          {scores.map((score) => {
            const isSelected = currentScore === score
            return (
              <button
                key={score}
                type="button"
                onClick={() => field.onChange(score)}
                className={cn(
                  'size-10 rounded-lg border-2 font-semibold text-sm transition-all duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  getButtonColor(score, isSelected)
                )}
              >
                {score}
              </button>
            )
          })}
        </div>
      )}
    />
  )
}
