'use client'
import { useState, useEffect, useRef } from 'react'
import { isInternalSender, detectInternalSender } from '@/lib/internal-senders'
import { ReadonlyURLSearchParams } from 'next/navigation'

export type ImportedEmail = {
  emailSubject: string
  emailBody: string
  emailFrom: string
  emailFromEmail: string
  emailFromName: string
  emailDate: string
  emailTo: string
  emailRawContent: string
  emailSourceMetadata?: string
}

export type ParsedEmailData = {
  rawText: string
  subject?: string
  entryDateOnly?: string
  entryTime?: string
  direction?: 'received' | 'sent'
  internalSender?: string
  emailSourceMetadata?: unknown
  senderEmail?: string
  senderName?: string
  truncated?: boolean
  contactId?: string
}

function parseEmailDate(dateStr: string): { entryDateOnly: string; entryTime: string } | null {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    return {
      entryDateOnly: date.toISOString().slice(0, 10),
      entryTime: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
    }
  } catch {
    return null
  }
}

function buildRawText(email: { emailFrom?: string; emailTo?: string; emailDate?: string; emailSubject?: string; emailBody?: string }) {
  return [
    email.emailFrom ? `From: ${email.emailFrom}` : '',
    email.emailTo ? `To: ${email.emailTo}` : '',
    email.emailDate ? `Date: ${email.emailDate}` : '',
    email.emailSubject ? `Subject: ${email.emailSubject}` : '',
    '',
    email.emailBody || '',
  ].filter((line, i) => i >= 4 || line !== '').join('\n')
}

function toEmailData(email: ImportedEmail): ParsedEmailData {
  const parsed: ParsedEmailData = {
    rawText: email.emailRawContent || buildRawText(email),
  }
  if (email.emailSubject) parsed.subject = email.emailSubject
  if (email.emailDate) {
    const dateResult = parseEmailDate(email.emailDate)
    if (dateResult) {
      parsed.entryDateOnly = dateResult.entryDateOnly
      parsed.entryTime = dateResult.entryTime
    }
  }
  if (email.emailSourceMetadata) {
    try {
      parsed.emailSourceMetadata =
        typeof email.emailSourceMetadata === 'string'
          ? JSON.parse(email.emailSourceMetadata)
          : email.emailSourceMetadata
    } catch { /* ignore */ }
  }
  if (email.emailFrom) {
    if (isInternalSender(email.emailFrom)) {
      parsed.direction = 'sent'
      parsed.internalSender = detectInternalSender(email.emailFrom) ?? undefined
    } else {
      parsed.direction = 'received'
    }
  }
  if (email.emailFromEmail) {
    parsed.senderEmail = email.emailFromEmail
    parsed.senderName = email.emailFrom || email.emailFromEmail
  }
  return parsed
}

export function useEmailImport(params: {
  searchParams: ReadonlyURLSearchParams
  businessIdFromQuery: string | null
  onApplyEmail: (data: ParsedEmailData) => Promise<void>
  setIsLoading: (v: boolean) => void
  setActionWarning: (v: string | null) => void
}) {
  const { searchParams, businessIdFromQuery, setIsLoading, setActionWarning } = params
  // Stable ref so the postMessage listener always has the latest callback
  const onApplyEmailRef = useRef(params.onApplyEmail)
  useEffect(() => { onApplyEmailRef.current = params.onApplyEmail })

  const [pendingEmails, setPendingEmails] = useState<ImportedEmail[]>([])
  const [selectedEmailIndices, setSelectedEmailIndices] = useState<Set<number>>(new Set())
  const [showEmailSelection, setShowEmailSelection] = useState(false)

  const emailImported = !!(
    searchParams.get('emailSubject') ||
    searchParams.get('emailBody') ||
    searchParams.get('emailRawContent')
  )

  // postMessage listener (bookmarklet)
  useEffect(() => {
    const awaitingEmail = searchParams.get('awaitingEmail')
    if (awaitingEmail !== '1') return

    const handleMessage = async (event: MessageEvent) => {
      const allowedOrigins = ['outlook', 'office.com', 'live.com', 'mail.google.com']
      if (!allowedOrigins.some((o) => event.origin.includes(o))) return

      // v2 bookmarklet: multi-email array
      if (event.data?.type === 'EMAIL_IMPORT' && Array.isArray(event.data.emails)) {
        const emails: ImportedEmail[] = event.data.emails
        if (emails.length === 0) return
        if (emails.length === 1) {
          await onApplyEmailRef.current(toEmailData(emails[0]))
        } else {
          setPendingEmails(emails)
          setSelectedEmailIndices(new Set(emails.map((_, i) => i)))
          setShowEmailSelection(true)
        }
        return
      }

      // Legacy single-email format
      if (event.data?.type === 'OUTLOOK_EMAIL_DATA' || event.data?.type === 'EMAIL_DATA') {
        await onApplyEmailRef.current(toEmailData(event.data.data))
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [searchParams])

  // Token-based retrieval (API fallback)
  useEffect(() => {
    const emailToken = searchParams.get('emailToken')
    if (!emailToken) return

    async function fetchByToken() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/import-email/retrieve/${emailToken}`)
        if (!res.ok) throw new Error('Failed to retrieve email data')
        const { success, emailData } = await res.json()
        if (success && emailData) {
          await onApplyEmailRef.current(toEmailData(emailData))
        }
      } catch (err) {
        console.error('Email token retrieval failed:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchByToken()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL param import (bookmarklet v1 / direct URL)
  useEffect(() => {
    const emailToken = searchParams.get('emailToken')
    const awaitingEmail = searchParams.get('awaitingEmail')
    if (emailToken || awaitingEmail === '1') return // handled above

    const emailSubject = searchParams.get('emailSubject')
    const emailBody = searchParams.get('emailBody')
    const emailFrom = searchParams.get('emailFrom')
    const emailFromEmail = searchParams.get('emailFromEmail')
    const emailDate = searchParams.get('emailDate')
    const emailRawContent = searchParams.get('emailRawContent')
    const contactIdFromQuery = searchParams.get('contactId')
    const truncated = searchParams.get('truncated')

    if (!emailSubject && !emailBody && !emailRawContent) return

    const emailData: ImportedEmail = {
      emailSubject: emailSubject || '',
      emailBody: emailBody || '',
      emailFrom: emailFrom || '',
      emailFromEmail: emailFromEmail || '',
      emailFromName: '',
      emailDate: emailDate || '',
      emailTo: searchParams.get('emailTo') || '',
      emailRawContent: emailRawContent ? decodeURIComponent(emailRawContent) : '',
    }

    const parsed = toEmailData(emailData)
    if (contactIdFromQuery) parsed.contactId = contactIdFromQuery
    if (truncated === '1') parsed.truncated = true

    onApplyEmailRef.current(parsed).then(() => {
      if (truncated === '1') {
        setActionWarning(
          'Note: This email was truncated due to length. The first 3000 characters have been imported. You may need to copy additional content manually from Outlook.'
        )
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPendingEmail = async (email: ImportedEmail) => {
    await onApplyEmailRef.current(toEmailData(email))
  }

  return {
    pendingEmails,
    selectedEmailIndices,
    setSelectedEmailIndices,
    showEmailSelection,
    setShowEmailSelection,
    emailImported,
    applyPendingEmail,
  }
}
