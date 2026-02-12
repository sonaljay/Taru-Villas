'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  auth_failed: 'Authentication failed. Please try again.',
  no_profile: 'No account found. Please contact your administrator to get access.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [loading, setLoading] = useState(false)

  async function handleGoogleLogin() {
    setLoading(true)
    const supabase = createClient()

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    })
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-4">
        <img
          src="/TVPL.png"
          alt="Taru Villas logo"
          className="mx-auto size-16"
        />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Taru Villas</h1>
          <p className="text-muted-foreground">Management Portal</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {ERROR_MESSAGES[error] ?? 'An unexpected error occurred. Please try again.'}
        </div>
      )}

      <div className="space-y-4">
        <Button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have access? Contact your administrator.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
