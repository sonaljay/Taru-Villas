import { subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays, format } from 'date-fns'

export type RangePreset = 'this-month' | 'last-month' | 'last-3m' | 'last-6m' | 'last-12m' | 'custom'

export interface ResolvedRange {
  from: string // YYYY-MM-DD
  to: string
  isThisMonth: boolean
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

/** Resolve a preset (or custom dates) to an inclusive {from,to} date range. */
export function resolveRange(
  preset: RangePreset,
  today: string,
  customFrom?: string,
  customTo?: string
): ResolvedRange {
  const t = parseISO(today)
  switch (preset) {
    case 'this-month':
      return { from: fmt(startOfMonth(t)), to: today, isThisMonth: true }
    case 'last-month': {
      const lm = subMonths(t, 1)
      return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)), isThisMonth: false }
    }
    case 'last-3m':
      return { from: fmt(subMonths(t, 3)), to: today, isThisMonth: false }
    case 'last-6m':
      return { from: fmt(subMonths(t, 6)), to: today, isThisMonth: false }
    case 'last-12m':
      return { from: fmt(subMonths(t, 12)), to: today, isThisMonth: false }
    case 'custom':
      return {
        from: customFrom || fmt(subMonths(t, 1)),
        to: customTo || today,
        isThisMonth: false,
      }
  }
}

/** The equal-length window immediately preceding `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = parseISO(from)
  const t = parseISO(to)
  const len = differenceInCalendarDays(t, f) // days
  const prevTo = subDays(f, 1)
  const prevFrom = subDays(prevTo, len)
  return { from: fmt(prevFrom), to: fmt(prevTo) }
}

/** 'YYYY-MM' bucket key for a 'YYYY-MM-DD' date. */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Inclusive calendar-day count of a range. */
export function rangeDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
}
