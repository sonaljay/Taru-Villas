'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { format } from 'date-fns'
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Loader2,
  MessageSquareText,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Submission {
  id: string
  templateId: string
  propertyId: string
  submittedBy: string | null
  status: string
  visitDate: string
  notes: string | null
  guestName: string | null
  guestEmail: string | null
  guestLinkId: string | null
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  propertyName: string
  templateName: string
  submitterName: string | null
}

interface ResponseDetail {
  questionId: string
  score: number
  note: string | null
}

interface Question {
  id: string
  text: string
  scaleMin: number
  scaleMax: number
  sortOrder: number
}

interface Category {
  id: string
  name: string
  weight: string
  sortOrder: number
  questions: Question[]
}

interface AdminSurveysClientProps {
  submissions: Submission[]
  properties: { id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
    case 'submitted':
      return <Badge variant="default">Submitted</Badge>
    case 'reviewed':
      return (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">
          Reviewed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getScoreColor(score: number, min: number, max: number): string {
  const normalized = ((score - min) / (max - min)) * 10
  if (normalized > 7) return 'text-emerald-600'
  if (normalized >= 5) return 'text-amber-600'
  return 'text-red-600'
}

function getBarColor(score: number, min: number, max: number): string {
  const normalized = ((score - min) / (max - min)) * 10
  if (normalized > 7) return 'bg-emerald-500'
  if (normalized >= 5) return 'bg-amber-500'
  return 'bg-red-500'
}

// ---------------------------------------------------------------------------
// Expanded Row — loads full response detail on mount
// ---------------------------------------------------------------------------

function SurveyResponseDetail({
  submissionId,
  templateId,
}: {
  submissionId: string
  templateId: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [responses, setResponses] = useState<ResponseDetail[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [subRes, tmplRes] = await Promise.all([
          fetch(`/api/surveys/${submissionId}`),
          fetch(`/api/templates/${templateId}`),
        ])
        if (!subRes.ok || !tmplRes.ok) {
          throw new Error('Failed to load survey details')
        }
        const [subData, tmplData] = await Promise.all([
          subRes.json(),
          tmplRes.json(),
        ])
        if (!cancelled) {
          setResponses(subData.responses ?? [])
          setCategories(tmplData.categories ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [submissionId, templateId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading responses...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  const responseMap = new Map(responses.map((r) => [r.questionId, r]))

  const categoryScores = categories
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((cat) => {
      const questions = cat.questions.sort((a, b) => a.sortOrder - b.sortOrder)
      let total = 0
      let count = 0
      for (const q of questions) {
        const r = responseMap.get(q.id)
        if (r) {
          total += ((r.score - q.scaleMin) / (q.scaleMax - q.scaleMin)) * 10
          count++
        }
      }
      return { cat, questions, avg: count > 0 ? total / count : 0, count }
    })

  let wSum = 0
  let wTotal = 0
  for (const cs of categoryScores) {
    if (cs.count > 0) {
      const w = parseFloat(cs.cat.weight) || 1
      wSum += cs.avg * w
      wTotal += w
    }
  }
  const overall = wTotal > 0 ? wSum / wTotal : 0

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Overall Score:
        </span>
        <span
          className={`text-lg font-bold tabular-nums ${
            overall > 7
              ? 'text-emerald-600'
              : overall >= 5
                ? 'text-amber-600'
                : 'text-red-600'
          }`}
        >
          {overall.toFixed(1)}/10
        </span>
        <span className="text-xs text-muted-foreground">
          ({responses.length} responses)
        </span>
      </div>

      {/* Category breakdowns */}
      {categoryScores.map(({ cat, questions, avg, count }) => (
        <div key={cat.id} className="rounded-lg border">
          <div className="flex items-center justify-between bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-semibold">{cat.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Weight: {parseFloat(cat.weight) || 1}x
              </span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  count > 0
                    ? avg > 7
                      ? 'text-emerald-600'
                      : avg >= 5
                        ? 'text-amber-600'
                        : 'text-red-600'
                    : 'text-muted-foreground'
                }`}
              >
                {count > 0 ? avg.toFixed(1) : 'N/A'}
              </span>
            </div>
          </div>

          <div className="divide-y">
            {questions.map((q) => {
              const r = responseMap.get(q.id)
              return (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm flex-1">{q.text}</p>
                    {r ? (
                      <span
                        className={`text-base font-bold tabular-nums min-w-[3ch] text-right ${getScoreColor(r.score, q.scaleMin, q.scaleMax)}`}
                      >
                        {r.score}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  {r && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground tabular-nums w-3">
                        {q.scaleMin}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getBarColor(r.score, q.scaleMin, q.scaleMax)}`}
                          style={{
                            width: `${((r.score - q.scaleMin) / (q.scaleMax - q.scaleMin)) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-3 text-right">
                        {q.scaleMax}
                      </span>
                    </div>
                  )}
                  {r?.note && (
                    <div className="mt-2 flex items-start gap-1.5 rounded bg-muted/50 px-2.5 py-1.5">
                      <MessageSquareText className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{r.note}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AdminSurveysClient({
  submissions,
  properties,
}: AdminSurveysClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (propertyFilter !== 'all' && s.propertyId !== propertyFilter)
        return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (dateFrom && s.visitDate < dateFrom) return false
      if (dateTo && s.visitDate > dateTo) return false
      if (search) {
        const q = search.toLowerCase()
        const submitter = s.submitterName ?? s.guestName ?? ''
        if (
          !s.propertyName.toLowerCase().includes(q) &&
          !submitter.toLowerCase().includes(q) &&
          !s.templateName.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [submissions, propertyFilter, statusFilter, search, dateFrom, dateTo])

  const hasFilters =
    propertyFilter !== 'all' ||
    statusFilter !== 'all' ||
    search ||
    dateFrom ||
    dateTo

  const clearFilters = useCallback(() => {
    setPropertyFilter('all')
    setStatusFilter('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Survey History
        </h1>
        <p className="text-sm text-muted-foreground">
          View all submitted surveys across properties with full response
          details.
        </p>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search property, name, template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Property</Label>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No surveys found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {hasFilters
                ? 'No surveys match your current filters. Try adjusting them.'
                : 'No surveys have been submitted yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Property</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Visit Date</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Submitted At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const isExpanded = expandedId === s.id
                return (
                  <>
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : s.id)
                      }
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {s.propertyName}
                      </TableCell>
                      <TableCell>{s.templateName}</TableCell>
                      <TableCell>
                        {format(new Date(s.visitDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {s.submitterName ?? s.guestName ?? (s.guestLinkId ? 'Guest' : 'Unknown')}
                      </TableCell>
                      <TableCell>{getStatusBadge(s.status)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {s.submittedAt
                          ? format(
                              new Date(s.submittedAt),
                              'MMM d, yyyy HH:mm'
                            )
                          : '—'}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${s.id}-detail`}>
                        <TableCell colSpan={7} className="p-0">
                          <div className="border-t bg-muted/20 px-6 py-5">
                            <SurveyResponseDetail
                              submissionId={s.id}
                              templateId={s.templateId}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {submissions.length} surveys
      </p>
    </div>
  )
}
