'use client'
import { useState, useEffect, useRef } from 'react'
import { extractContactsFromText, type ExtractedContact } from '@/lib/contact-extraction'

export function useContactExtraction(rawText: string, selectedBusinessId: string | null) {
  const [extractedContacts, setExtractedContacts] = useState<ExtractedContact[]>([])
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactsAdded, setContactsAdded] = useState(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (rawText.trim().length < 100) {
      setExtractedContacts([])
      return
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setExtractedContacts(extractContactsFromText(rawText).contacts)
    }, 500)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [rawText])

  // Reset added count when business changes
  useEffect(() => {
    setContactsAdded(0)
  }, [selectedBusinessId])

  return { extractedContacts, showContactModal, setShowContactModal, contactsAdded, setContactsAdded }
}
