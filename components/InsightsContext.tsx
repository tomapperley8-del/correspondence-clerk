'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface InsightsContextValue {
  isOpen: boolean
  businessId: string | null
  businessName: string | null
  toggle: () => void
  open: (businessId?: string | null, businessName?: string | null) => void
  close: () => void
}

const InsightsContext = createContext<InsightsContextValue | null>(null)

export function InsightsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState<string | null>(null)

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  const open = useCallback((id?: string | null, name?: string | null) => {
    setBusinessId(id ?? null)
    setBusinessName(name ?? null)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <InsightsContext.Provider value={{ isOpen, businessId, businessName, toggle, open, close }}>
      {children}
    </InsightsContext.Provider>
  )
}

export function useInsights() {
  const ctx = useContext(InsightsContext)
  if (!ctx) throw new Error('useInsights must be used within InsightsProvider')
  return ctx
}
