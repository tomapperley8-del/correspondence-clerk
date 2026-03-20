'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function EmailCleanerPage() {
  const [inputText, setInputText] = useState('')
  const [cleanedText, setCleanedText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailCapture, setShowEmailCapture] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSubmitted, setEmailSubmitted] = useState(false)

  const handleClean = async () => {
    if (!inputText.trim()) return

    setIsLoading(true)
    setError(null)
    setCleanedText('')

    try {
      const response = await fetch('/api/tools/clean-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })

      if (!response.ok) {
        throw new Error('Failed to clean email')
      }

      const data = await response.json()
      setCleanedText(data.cleaned_text)
      setShowEmailCapture(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    try {
      await fetch('/api/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'email_cleaner',
        }),
      })
      setEmailSubmitted(true)
    } catch {
      // Silent fail - don't block user
      setEmailSubmitted(true)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-lg font-medium">
              Correspondence Clerk
            </Link>
            <Link
              href="/signup"
              className="text-sm bg-gray-900 text-white px-4 py-2 hover:bg-gray-800"
            >
              Try free
            </Link>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-medium text-gray-900 mb-2">
            Email Thread Cleaner
          </h1>
          <p className="text-gray-600 mb-8">
            Paste a messy email thread. We&apos;ll clean up the formatting.
          </p>

          {/* Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste your email here
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste the email or thread you want to clean up..."
              className="w-full h-48 p-3 border border-gray-300 focus:border-gray-500 focus:outline-none"
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleClean}
            disabled={isLoading || !inputText.trim()}
            className="bg-gray-900 text-white px-6 py-2 hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Cleaning...' : 'Clean Email'}
          </button>

          {error && (
            <p className="mt-4 text-red-600 text-sm">{error}</p>
          )}

          {/* Result */}
          {cleanedText && (
            <div className="mt-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Cleaned Email
              </h2>
              <div className="p-4 bg-gray-50 border border-gray-200 whitespace-pre-wrap font-mono text-sm">
                {cleanedText}
              </div>

              {/* Email capture - soft, not pushy */}
              {showEmailCapture && !emailSubmitted && (
                <div className="mt-6 p-4 bg-gray-50 border border-gray-200">
                  <p className="text-sm text-gray-700 mb-3">
                    Want to save this somewhere searchable? Correspondence Clerk keeps all your important client emails in one place.
                  </p>
                  <form onSubmit={handleEmailSubmit} className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email"
                      className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:border-gray-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800"
                    >
                      Try free
                    </button>
                  </form>
                  <p className="text-xs text-gray-400 mt-2">
                    14-day trial. No card required.
                  </p>
                </div>
              )}

              {emailSubmitted && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200">
                  <p className="text-sm text-green-800">
                    Thanks! Check your email to get started.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-100 mt-12">
        <div className="max-w-2xl mx-auto flex justify-between items-center text-sm text-gray-400">
          <span>Correspondence Clerk</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-gray-600">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
