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
      }, 5000)
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
          role="status"
          className={`px-4 py-3 text-sm font-medium shadow-lg border-2 pointer-events-auto transition-all duration-200 ${
            t.variant === 'success'
              ? 'bg-brand-olive text-white border-[#5a7340]'
              : t.variant === 'error'
              ? 'bg-red-600 text-white border-red-800'
              : 'bg-brand-dark text-white border-brand-navy'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-white/70 hover:text-white text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
