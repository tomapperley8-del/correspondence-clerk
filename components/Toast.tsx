'use client'

import { useEffect, useState } from 'react'
import type { ToastVariant } from '@/lib/toast'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, variant } = (e as CustomEvent).detail
      const id = Date.now()
      setToasts((prev) => [...prev, { id, message, variant }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 3000)
    }
    window.addEventListener('app:toast', handler)
    return () => window.removeEventListener('app:toast', handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 text-sm font-medium shadow-lg border-2 pointer-events-auto transition-all duration-200 ${
            t.variant === 'success'
              ? 'bg-[#7C9A5E] text-white border-[#5a7340]'
              : t.variant === 'error'
              ? 'bg-red-600 text-white border-red-800'
              : 'bg-[#1E293B] text-white border-[#2C4A6E]'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
