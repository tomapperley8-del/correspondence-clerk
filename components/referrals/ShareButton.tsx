'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface ShareButtonProps {
  url: string
  text?: string
}

export function ShareButton({ url, text = 'Check out Correspondence Clerk - it helps manage business correspondence!' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare('share' in navigator)
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Correspondence Clerk',
          text,
          url,
        })
      } catch {
        // User cancelled or share failed, fallback to copy
        handleCopy()
      }
    } else {
      handleCopy()
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        onClick={handleShare}
        variant="default"
      >
        {canShare ? 'Share' : copied ? 'Copied' : 'Copy Link'}
      </Button>

      {/* Social sharing buttons */}
      <Button
        onClick={() => window.open(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
          '_blank',
          'width=600,height=400'
        )}
        variant="outline"
        title="Share on LinkedIn"
      >
        LinkedIn
      </Button>

      <Button
        onClick={() => window.open(
          `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
          '_blank',
          'width=600,height=400'
        )}
        variant="outline"
        title="Share on Twitter"
      >
        Twitter
      </Button>

      <Button
        onClick={() => window.open(
          `mailto:?subject=${encodeURIComponent('Try Correspondence Clerk')}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
          '_blank'
        )}
        variant="outline"
        title="Share via Email"
      >
        Email
      </Button>
    </div>
  )
}
