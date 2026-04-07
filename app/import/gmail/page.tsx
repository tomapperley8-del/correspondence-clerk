'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ReviewWizard } from '@/components/import/ReviewWizard'
import type { ScanResult } from '@/lib/email-import/domain-grouper'

type Step = 'connect' | 'configure' | 'scanning' | 'review' | 'done'

export default function GmailImportPage() {
  const [step, setStep] = useState<Step>('configure')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [months, setMonths] = useState<number>(3)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [scanStats, setScanStats] = useState<{ businesses: number; contacts: number; emails: number } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [doneStats, setDoneStats] = useState<{ imported: number; skipped: number } | null>(null)

  // Check connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      const res = await fetch('/api/import/gmail/status')
      if (res.ok) {
        const data = await res.json()
        setConnected(data.connected)
        if (!data.connected) setStep('connect')
      }
    }
    checkConnection()
  }, [])

  const handleScan = async () => {
    setScanError(null)
    setStep('scanning')

    const res = await fetch('/api/import/gmail/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ months }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setScanError(err.error || 'Scan failed. Please try again.')
      setStep('configure')
      return
    }

    const data = await res.json()
    setScanId(data.scanId)
    setScanStats({ businesses: data.businessCount, contacts: data.contactCount, emails: data.emailCount })

    // Fetch full scan result for review wizard
    const resultRes = await fetch(`/api/import/scan-result?scanId=${data.scanId}`)
    if (resultRes.ok) {
      const result = await resultRes.json()
      setScanResult(result)
    }

    setStep('review')
  }

  if (step === 'connect' || connected === false) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        <div className="mb-6">
          <Link href="/import" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to Import
          </Link>
        </div>
        <div className="bg-white border border-gray-200 rounded p-8 shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,0.06))]">
          <h1 className="font-[Lora,serif] text-2xl font-semibold text-brand-dark mb-2">Connect Gmail</h1>
          <p className="text-gray-500 text-sm mb-6">
            Connect your Gmail account to import your email history. We only read your emails — we never send,
            delete, or modify anything.
          </p>
          <a
            href="/api/auth/google"
            className="inline-block px-5 py-2.5 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Connect Gmail
          </a>
        </div>
      </div>
    )
  }

  if (step === 'done' && doneStats) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4 text-center">
        <div className="bg-white border border-gray-200 rounded p-10 shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,0.06))]">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 text-xl">
            ✓
          </div>
          <h2 className="font-[Lora,serif] text-2xl font-semibold text-brand-dark mb-2">Import complete</h2>
          <p className="text-gray-500 text-sm mb-2">
            <span className="font-medium text-brand-dark">{doneStats.imported}</span> email{doneStats.imported !== 1 ? 's' : ''} imported
            {doneStats.skipped > 0 && `, ${doneStats.skipped} skipped (duplicates)`}
          </p>
          <p className="text-gray-400 text-xs mb-8">
            AI formatting is running in the background. Emails will appear formatted within a few minutes.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard"
              className="inline-block text-center px-5 py-2.5 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={() => { setStep('configure'); setDoneStats(null); setScanResult(null) }}
              className="text-sm text-gray-500 hover:text-brand-navy"
            >
              Import more emails
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/import" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Import
        </Link>
      </div>

      <h1 className="font-[Lora,serif] text-2xl font-semibold text-brand-dark mb-1">Import from Gmail</h1>
      <p className="text-gray-500 text-sm mb-8">
        Scan your Gmail inbox and choose which emails to import. We&apos;ll suggest business and contact names — you review everything before anything is saved.
      </p>

      {/* Step: configure */}
      {step === 'configure' && (
        <div className="bg-white border border-gray-200 rounded p-6 shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,0.06))]">
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">How far back to scan</label>
            <p className="text-xs text-gray-400 mb-2">3 months is a good starting point</p>
            <div className="flex gap-2">
              {[1, 3, 6].map((m) => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={`px-4 py-2 text-sm border transition-colors ${
                    months === m
                      ? 'border-brand-navy bg-brand-navy text-white'
                      : 'border-gray-300 text-gray-600 hover:border-brand-navy'
                  }`}
                >
                  {m} month{m !== 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {scanError && (
            <p className="text-sm text-red-600 mb-4 p-3 bg-red-50 border border-red-200 rounded">{scanError}</p>
          )}

          <button
            onClick={handleScan}
            className="px-5 py-2.5 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Scan Gmail
          </button>
        </div>
      )}

      {/* Step: scanning */}
      {step === 'scanning' && (
        <div className="bg-white border border-gray-200 rounded p-8 text-center shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,0.06))]">
          <div className="w-8 h-8 border-2 border-brand-navy border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-sm">Scanning your Gmail inbox…</p>
          <p className="text-gray-400 text-xs mt-1">Reading the last {months} month{months !== 1 ? 's' : ''} of email headers</p>
        </div>
      )}

      {/* Step: review */}
      {step === 'review' && scanResult && scanId && (
        <>
          <div className="bg-brand-paper border border-gray-200 rounded px-4 py-3 mb-6 text-sm text-gray-600">
            Found{' '}
            <span className="font-medium text-brand-dark">{scanStats?.emails ?? 0}</span> emails across{' '}
            <span className="font-medium text-brand-dark">{scanStats?.businesses ?? 0}</span> businesses and{' '}
            <span className="font-medium text-brand-dark">{scanStats?.contacts ?? 0}</span> contacts.
            Check the names below and untick anything you don&apos;t want to import.
          </div>
          <ReviewWizard
            scanResult={scanResult}
            scanId={scanId}
            provider="gmail"
            onImportComplete={(imported, skipped) => {
              setDoneStats({ imported, skipped })
              setStep('done')
            }}
          />
        </>
      )}
    </div>
  )
}
