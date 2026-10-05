import { createHash, timingSafeEqual } from 'node:crypto'
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}
