'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface SuccessBannerProps {
  message: string
  duration?: number
}

export function SuccessBanner({ message, duration = 8000 }: SuccessBannerProps) {
  const [isVisible, setIsVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remainingRef = useRef(duration)
  const startTimeRef = useRef(0)

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    timerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, remainingRef.current)
  }, [])

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      const elapsed = Date.now() - startTimeRef.current
      remainingRef.current = Math.max(0, remainingRef.current - elapsed)
    }
  }, [])

  useEffect(() => {
    startTimer()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [startTimer])

  const handleMouseEnter = () => {
    pauseTimer()
  }

  const handleMouseLeave = () => {
    startTimer()
  }

  if (!isVisible) {
    return null
  }

  return (
    <div
      role="status"
      className="bg-green-50 border-2 border-green-600 px-4 py-3 mb-6 flex justify-between items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <p className="text-green-800 font-semibold">{message}</p>
      <button
        onClick={() => setIsVisible(false)}
        className="text-green-800 hover:text-green-900 font-semibold px-2"
        aria-label="Dismiss success message"
      >
        Dismiss
      </button>
    </div>
  )
}
