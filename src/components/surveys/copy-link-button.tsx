'use client'

import { useState } from 'react'
import { Check, Link as LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CopyLinkButtonProps {
  slug: string
}

export function CopyLinkButton({ slug }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const url = `${window.location.origin}/surveys/s/${slug}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      title="Copy shareable link"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-600" />
          <span className="text-emerald-600">Copied!</span>
        </>
      ) : (
        <>
          <LinkIcon className="size-3.5" />
          Share
        </>
      )}
    </Button>
  )
}
