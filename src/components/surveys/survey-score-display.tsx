'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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

interface Category {
  id: string
  name: string
  weight: string
  sortOrder: number
  questions: Question[]
}

interface Response {
  questionId: string
  score: number
  note: string | null
}

interface SurveyScoreDisplayProps {
  categories: Category[]
  responses: Response[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number, min: number, max: number): string {
  const normalized = ((score - min) / (max - min)) * 10
  if (normalized > 7) return 'bg-emerald-500'
  if (normalized >= 5) return 'bg-amber-500'
  return 'bg-red-500'
}

function getScoreTextColor(score: number, min: number, max: number): string {
  const normalized = ((score - min) / (max - min)) * 10
  if (normalized > 7) return 'text-emerald-600'
  if (normalized >= 5) return 'text-amber-600'
  return 'text-red-600'
}

function getBarWidth(score: number, min: number, max: number): number {
  return ((score - min) / (max - min)) * 100
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyScoreDisplay({
  categories,
  responses,
}: SurveyScoreDisplayProps) {
  const responseMap = new Map(responses.map((r) => [r.questionId, r]))

  // Calculate category averages and overall weighted average
  const categoryScores = categories
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => {
      const questions = category.questions.sort(
        (a, b) => a.sortOrder - b.sortOrder
      )
      const weight = parseFloat(category.weight) || 1

      let totalNormalized = 0
      let answeredCount = 0

      const questionScores = questions.map((question) => {
        const response = responseMap.get(question.id)
        if (response) {
          const normalized =
            ((response.score - question.scaleMin) /
              (question.scaleMax - question.scaleMin)) *
            10
          totalNormalized += normalized
          answeredCount++
        }
        return {
          question,
          response,
        }
      })

      const average = answeredCount > 0 ? totalNormalized / answeredCount : 0

      return {
        category,
        weight,
        average,
        answeredCount,
        questionScores,
      }
    })

  // Overall weighted average (normalized to 0-10 scale)
  let weightedSum = 0
  let totalWeight = 0
  for (const cs of categoryScores) {
    if (cs.answeredCount > 0) {
      weightedSum += cs.average * cs.weight
      totalWeight += cs.weight
    }
  }
  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0

  function getOverallColor(score: number): string {
    if (score > 7) return 'text-emerald-600'
    if (score >= 5) return 'text-amber-600'
    return 'text-red-600'
  }

  function getOverallBgColor(score: number): string {
    if (score > 7) return 'bg-emerald-50 border-emerald-200'
    if (score >= 5) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Overall score */}
      <Card className={`${getOverallBgColor(overallScore)} print:break-inside-avoid`}>
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Overall Weighted Score
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {responses.length} responses across{' '}
              {categoryScores.filter((cs) => cs.answeredCount > 0).length}{' '}
              categories
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-4xl font-bold tabular-nums ${getOverallColor(overallScore)}`}
            >
              {overallScore.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">out of 10</p>
          </div>
        </CardContent>
      </Card>

      {/* Category scores summary */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle className="text-base">Category Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {categoryScores.map(({ category, average, weight, answeredCount }) => (
            <div key={category.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{category.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Weight: {weight}x
                  </span>
                  <span
                    className={`font-bold tabular-nums ${
                      answeredCount > 0
                        ? average > 7
                          ? 'text-emerald-600'
                          : average >= 5
                            ? 'text-amber-600'
                            : 'text-red-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {answeredCount > 0 ? average.toFixed(1) : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    average > 7
                      ? 'bg-emerald-500'
                      : average >= 5
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{
                    width: answeredCount > 0 ? `${(average / 10) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Detailed question scores */}
      {categoryScores.map(({ category, questionScores }) => (
        <Card key={category.id} className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle>{category.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {questionScores.map(({ question, response }, index) => (
              <div key={question.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm">{question.text}</p>
                    {question.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{question.description}</p>
                    )}
                  </div>
                  {response ? (
                    <span
                      className={`text-lg font-bold tabular-nums min-w-[3ch] text-right ${getScoreTextColor(response.score, question.scaleMin, question.scaleMax)}`}
                    >
                      {response.score}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Not answered
                    </span>
                  )}
                </div>

                {response && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums w-4">
                      {question.scaleMin}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getScoreColor(response.score, question.scaleMin, question.scaleMax)}`}
                        style={{
                          width: `${getBarWidth(response.score, question.scaleMin, question.scaleMax)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-4 text-right">
                      {question.scaleMax}
                    </span>
                  </div>
                )}

                {response?.note && (
                  <div className="mt-2 rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">
                      Note
                    </p>
                    <p className="text-sm">{response.note}</p>
                  </div>
                )}

                {index < questionScores.length - 1 && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
