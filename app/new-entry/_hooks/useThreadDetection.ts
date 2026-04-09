'use client'
import { useState, useEffect, useRef } from 'react'
import { detectEmailThread, shouldDefaultToSplit } from '@/lib/ai/thread-detection'

export type ThreadDetectionResult = {
  looksLikeThread: boolean
  confidence: 'low' | 'medium' | 'high'
  indicators: string[]
}

export function useThreadDetection(rawText: string) {
  const [threadDetection, setThreadDetection] = useState<ThreadDetectionResult | null>(null)
  const [shouldSplit, setShouldSplit] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (rawText.trim().length < 50) {
      setThreadDetection(null)
      setShouldSplit(false)
      return
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      setThreadDetection(detectEmailThread(rawText))
      setShouldSplit(shouldDefaultToSplit(rawText))
    }, 300)

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [rawText])

  return { threadDetection, shouldSplit, setShouldSplit }
}
