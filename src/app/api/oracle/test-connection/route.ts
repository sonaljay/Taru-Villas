import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { testConnection } from '@/lib/oracle/client'

// POST /api/oracle/test-connection — admin-only OHIP credential check
export async function POST() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await testConnection()
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/oracle/test-connection error:', error)
    return NextResponse.json({ ok: false, error: 'Connection test failed' })
  }
}
