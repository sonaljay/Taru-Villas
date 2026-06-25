export const WINDOW_HALF_MIN = 15

export type Slot = 'morning' | 'evening' | 'night'

export interface SlotTimes {
  morningTime: string // 'HH:MM' or 'HH:MM:SS'
  eveningTime: string
  nightTime: string
}

/** Minutes since midnight for an 'HH:MM[:SS]' string. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

export function parseSlotMinutes(slotTimes: SlotTimes): Record<Slot, number> {
  return {
    morning: toMinutes(slotTimes.morningTime),
    evening: toMinutes(slotTimes.eveningTime),
    night: toMinutes(slotTimes.nightTime),
  }
}

/** Current minute-of-day in IST (Asia/Kolkata). Impure (reads the clock). */
export function currentISTMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10)
  const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10)
  // Intl can yield '24' for midnight in some engines; normalise.
  return ((h % 24) * 60 + m)
}

/** Current IST calendar date as 'YYYY-MM-DD'. Impure. */
export function currentISTDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')!.value
  const mo = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${mo}-${d}`
}

/** Circular distance between two minute-of-day values (handles midnight wrap). */
function circularDelta(a: number, b: number): number {
  const raw = Math.abs(a - b)
  return Math.min(raw, 1440 - raw)
}

export function isSlotOpen(slot: Slot, nowMin: number, slotTimes: SlotTimes): boolean {
  const mins = parseSlotMinutes(slotTimes)
  return circularDelta(nowMin, mins[slot]) <= WINDOW_HALF_MIN
}

/** The single slot whose ±15 window currently contains nowMin, or null. */
export function openSlot(nowMin: number, slotTimes: SlotTimes): Slot | null {
  const slots: Slot[] = ['morning', 'evening', 'night']
  let best: Slot | null = null
  let bestDelta = WINDOW_HALF_MIN + 1
  const mins = parseSlotMinutes(slotTimes)
  for (const s of slots) {
    const d = circularDelta(nowMin, mins[s])
    if (d <= WINDOW_HALF_MIN && d < bestDelta) {
      best = s
      bestDelta = d
    }
  }
  return best
}

/** True when the slot's window has already closed earlier today (no wrap). */
export function windowClosedToday(slot: Slot, nowMin: number, slotTimes: SlotTimes): boolean {
  const mins = parseSlotMinutes(slotTimes)
  return nowMin > mins[slot] + WINDOW_HALF_MIN
}

function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function slotWindowLabel(slot: Slot, slotTimes: SlotTimes): string {
  const center = parseSlotMinutes(slotTimes)[slot]
  return `${fmt(center - WINDOW_HALF_MIN)}–${fmt(center + WINDOW_HALF_MIN)}`
}
