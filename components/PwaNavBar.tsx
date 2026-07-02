'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PwaNavBar() {
  const router = useRouter()
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    setIsStandalone(mq.matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
    const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (!isStandalone) return null

  return (
    <div className="sticky top-0 z-50 bg-brand-dark flex items-center gap-1 px-2 py-1.5 border-b border-white/10">
      <button
        onClick={() => router.back()}
        className="text-white/80 hover:text-white px-2 py-1 text-sm transition-colors flex items-center gap-1"
        aria-label="Go back"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <button
        onClick={() => router.refresh()}
        className="text-white/80 hover:text-white px-2 py-1 text-sm transition-colors flex items-center gap-1"
        aria-label="Refresh page"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
    </div>
  )
}
