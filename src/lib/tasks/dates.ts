export function localDate(now: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
const day = (value: string) =>
  Date.parse(value.slice(0, 10) + 'T00:00:00Z') / 86400000
export function reminderKind(
  due: string | null,
  status: string,
  now: Date = new Date(),
): 'upcoming' | 'overdue' | null {
  if (!due || status === 'done') return null
  const difference = day(due) - day(localDate(now))
  return difference === 1 ? 'upcoming' : difference < 0 ? 'overdue' : null
}
export function taskAge(
  created: string | Date,
  completed: string | Date | null,
  now: Date = new Date(),
) {
  return Math.max(
    0,
    day(localDate(completed ? new Date(completed) : now)) -
      day(localDate(new Date(created))),
  )
}
