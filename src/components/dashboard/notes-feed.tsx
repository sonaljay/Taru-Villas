'use client'

import { MessageSquareText } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export interface NoteItem {
  id: string
  question: string
  score: number
  note: string
  date: string
  surveyor: string
}

interface NotesFeedProps {
  title?: string
  notes: NoteItem[]
  maxHeight?: number
  className?: string
}

function getScoreBadgeVariant(score: number): 'default' | 'secondary' | 'destructive' {
  if (score >= 8) return 'default'
  if (score >= 5) return 'secondary'
  return 'destructive'
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function NotesFeed({
  title = 'Recent Notes',
  notes,
  maxHeight = 500,
  className,
}: NotesFeedProps) {
  if (!notes || notes.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <MessageSquareText className="size-8 opacity-40" />
            <p className="text-sm">No notes available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="size-4" />
          {title}
          <Badge variant="secondary" className="ml-auto text-xs">
            {notes.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea style={{ maxHeight }} className="pr-4">
          <div className="space-y-0">
            {notes.map((note, index) => (
              <div key={note.id}>
                <div className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium leading-tight">
                          {note.question}
                        </p>
                        <Badge
                          variant={getScoreBadgeVariant(note.score)}
                          className="shrink-0 text-[11px]"
                        >
                          {note.score}/10
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        {note.note}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{note.surveyor}</span>
                        <span className="text-border">|</span>
                        <span>{formatDate(note.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {index < notes.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
