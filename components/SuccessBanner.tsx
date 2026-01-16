'use client'

import { useEffect, useState } from 'react'

interface SuccessBannerProps {
  message: string
  duration?: number
}

export function SuccessBanner({ message, duration = 5000 }: SuccessBannerProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration])

  if (!isVisible) {
    return null
  }

  return (
    <div className="bg-green-50 border-2 border-green-600 px-4 py-3 mb-6 flex justify-between items-center">
      <p className="text-green-800 font-semibold">{message}</p>
      <button
        onClick={() => setIsVisible(false)}
        className="text-green-800 hover:text-green-900 font-semibold px-2"
      >
        ✕
      </button>
    </div>
  )
}
