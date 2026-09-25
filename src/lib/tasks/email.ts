export type EmailMessage = {
  to: string
  subject: string
  text: string
  key: string
}
export async function sendTaskEmail(
  m: EmailMessage,
): Promise<{ providerId: string }> {
  const key = process.env.RESEND_API_KEY,
    from = process.env.TASK_EMAIL_FROM
  if (!key || !from) throw Error('Task email sender is not configured.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': m.key,
    },
    body: JSON.stringify({
      from,
      to: [m.to],
      subject: m.subject,
      text: m.text,
    }),
  })
  if (!response.ok) throw Error(`Email provider returned ${response.status}`)
  const body = await response.json()
  if (typeof body.id !== 'string')
    throw Error('Email provider did not acknowledge delivery.')
  return { providerId: body.id }
}
