import { it, expect, vi, afterEach } from 'vitest'
import { sendTaskEmail } from './email'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
it('fails explicitly when sender configuration is absent', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  await expect(
    sendTaskEmail({
      to: 'a@example.com',
      subject: 'Task',
      text: 'Message',
      key: 'event',
    }),
  ).rejects.toThrow(/configured/i)
})
it('uses a stable idempotency key and validates provider acknowledgment', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test')
  vi.stubEnv('TASK_EMAIL_FROM', 'tasks@example.com')
  const request = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(JSON.stringify({ id: 'mail-id' }), { status: 200 }),
  )
  vi.stubGlobal('fetch', request)
  expect(
    await sendTaskEmail({
      to: 'a@example.com',
      subject: 'Task',
      text: 'Message',
      key: 'event',
    }),
  ).toEqual({ providerId: 'mail-id' })
  expect(request.mock.calls[0]?.[1]).toMatchObject({
    headers: expect.objectContaining({ 'Idempotency-Key': 'event' }),
  })
})
