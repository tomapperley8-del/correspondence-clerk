'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Provider = 'outlook' | 'gmail'

export default function BookmarkletPage() {
  const [provider, setProvider] = useState<Provider>('outlook')
  const [bookmarkletCode, setBookmarkletCode] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const bookmarkletLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    setIsReady(false)
    setBookmarkletCode('')

    // Fetch the bookmarklet code for the selected provider
    fetch(`/api/bookmarklet-code?provider=${provider}`)
      .then((res) => res.json())
      .then((data) => {
        setBookmarkletCode(data.code)
      })
      .catch((err) => {
        console.error('Failed to fetch bookmarklet code:', err)
      })
  }, [provider])

  // Check installed status when provider changes
  useEffect(() => {
    const hasBookmarkletStorage = localStorage.getItem(`bookmarklet-installed-${provider}`)
    setInstalled(!!hasBookmarkletStorage)
  }, [provider])

  // Set the href directly via DOM after mount to bypass React's security check
  // Only mark as ready after verifying href was actually set
  useEffect(() => {
    if (bookmarkletCode && bookmarkletLinkRef.current) {
      bookmarkletLinkRef.current.href = bookmarkletCode
      // Verify href was actually set before allowing drag
      if (bookmarkletLinkRef.current.href.startsWith('javascript:')) {
        setIsReady(true)
      }
    }
  }, [bookmarkletCode])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(bookmarkletCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMarkInstalled = () => {
    localStorage.setItem(`bookmarklet-installed-${provider}`, 'true')
    setInstalled(true)
  }

  const providerLabel = provider === 'outlook' ? 'Outlook' : 'Gmail'
  const providerDomain = provider === 'outlook' ? 'outlook.office.com or outlook.live.com' : 'mail.google.com'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Install Email Import Tool</h1>

      {/* Provider Toggle */}
      <div className="flex gap-0 mb-6">
        <button
          onClick={() => setProvider('outlook')}
          className={`px-6 py-3 font-semibold border-2 ${
            provider === 'outlook'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
          }`}
        >
          Outlook
        </button>
        <button
          onClick={() => setProvider('gmail')}
          className={`px-6 py-3 font-semibold border-2 border-l-0 ${
            provider === 'gmail'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
          }`}
        >
          Gmail
        </button>
      </div>

      {/* What it does */}
      <div className="bg-white border-2 border-gray-300 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">What This Tool Does</h2>
        <p className="text-gray-700 mb-4">
          The Email Import Tool is a bookmarklet that allows you to import emails
          directly from {providerLabel} into Correspondence Clerk with one click.
        </p>
        <p className="text-gray-700">
          When you click the bookmarklet while viewing an email in {providerLabel},
          it will automatically extract the email details (subject, sender, date,
          body) and open Correspondence Clerk with the form pre-filled, ready to
          save.
        </p>
      </div>

      {/* Installation Instructions */}
      <div className="bg-white border-2 border-gray-300 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Installation Instructions</h2>

        {/* Method 1: Drag and Drop */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">
            Method 1: Drag and Drop (Recommended)
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
            <li>Make sure your bookmarks bar is visible in your browser</li>
            <li>
              Drag the button below to your bookmarks bar:
              <div className="mt-3 p-4 bg-gray-100 border-2 border-gray-300 text-center">
                {/* Always keep anchor mounted, toggle visibility based on isReady */}
                <a
                  ref={bookmarkletLinkRef}
                  className={isReady
                    ? "inline-block px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-move"
                    : "hidden"
                  }
                  onClick={(e) => e.preventDefault()}
                  title="Drag this to your bookmarks bar"
                  aria-hidden={!isReady}
                >
                  Import from {providerLabel}
                </a>
                {!isReady && (
                  <div className="text-gray-500">Loading bookmarklet...</div>
                )}
              </div>
            </li>
            <li>
              Open an email in {providerLabel} ({providerDomain})
            </li>
            <li>Click the bookmarklet in your bookmarks bar</li>
            <li>
              Correspondence Clerk will open in a new tab with the email details
              pre-filled
            </li>
          </ol>
          <div className="bg-blue-50 border-2 border-blue-600 p-4 mt-4">
            <p className="text-sm text-gray-700">
              <strong>Tip:</strong> If you cannot drag the button, try Method 2
              below.
            </p>
          </div>
        </div>

        {/* Method 2: Manual Copy */}
        <div className="mb-6 pt-6 border-t-2 border-gray-300">
          <h3 className="font-semibold text-lg mb-3">
            Method 2: Manual Copy and Paste
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
            <li>Copy the bookmarklet code below</li>
            <li>
              Create a new bookmark in your browser (Right-click bookmarks bar &rarr;
              Add page)
            </li>
            <li>Name it &quot;Import from {providerLabel}&quot; (or any name you prefer)</li>
            <li>Paste the code as the URL</li>
            <li>Save the bookmark</li>
          </ol>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">
              Bookmarklet Code:
            </label>
            <div className="relative">
              <textarea
                readOnly
                value={bookmarkletCode}
                className="w-full h-32 px-3 py-2 border-2 border-gray-300 bg-gray-50 font-mono text-xs"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                onClick={handleCopyCode}
                className="absolute top-2 right-2"
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
            </div>
          </div>
        </div>

        {/* Mark as Installed */}
        <div className="pt-6 border-t-2 border-gray-300">
          {!installed ? (
            <Button
              onClick={handleMarkInstalled}
              className="w-full bg-green-600 text-white hover:bg-green-700"
            >
              I have Installed the {providerLabel} Bookmarklet
            </Button>
          ) : (
            <div className="text-center p-4 bg-green-50 border-2 border-green-600">
              <p className="text-green-800 font-semibold">
                {providerLabel} Bookmarklet Installed
              </p>
              <p className="text-sm text-gray-700 mt-2">
                You can now import emails from {providerLabel} with one click.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-white border-2 border-gray-300 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">
              &quot;Please open while viewing an email in {providerLabel}&quot;
            </h3>
            <p className="text-gray-700 text-sm">
              Make sure you are viewing an email in {providerLabel} ({providerDomain})
              when you click the bookmarklet. It will not work on other websites.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">
              &quot;Could not extract email body&quot;
            </h3>
            <p className="text-gray-700 text-sm">
              Make sure you have an email fully open (not just selected in the inbox).
              Wait for the email to fully load before clicking the bookmarklet.
              {provider === 'gmail'
                ? ' Gmail may have updated its layout - please report this issue.'
                : ' Outlook Web may have updated its layout - please report this issue.'}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">
              &quot;Popup blocked. Please allow popups for {providerLabel}&quot;
            </h3>
            <p className="text-gray-700 text-sm">
              Your browser is blocking the new tab from opening. Click the popup
              blocker icon in your address bar and allow popups for {providerLabel}, then
              try again.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Email data doesn&apos;t appear in form</h3>
            <p className="text-gray-700 text-sm">
              If Correspondence Clerk opens but fields are empty, make sure you&apos;re
              logged in and try clicking the bookmarklet again. Check your browser
              console for errors (F12 &rarr; Console tab).
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Bookmarklet does nothing</h3>
            <p className="text-gray-700 text-sm">
              Check your browser console for errors (F12 &rarr; Console tab). Make
              sure you copied the entire bookmarklet code including the
              &quot;javascript:&quot; prefix.
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-white border-2 border-gray-300 p-6">
        <h2 className="text-xl font-semibold mb-4">How It Works</h2>
        <div className="space-y-4 text-gray-700">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold mb-1">Open an email in {providerLabel}</h3>
              <p className="text-sm">
                Navigate to {providerDomain} and open any
                email you want to import.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold mb-1">
                Click the bookmarklet in your bookmarks bar
              </h3>
              <p className="text-sm">
                The bookmarklet will extract the email subject, sender, date, and
                body content.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold mb-1">
                Correspondence Clerk opens with pre-filled form
              </h3>
              <p className="text-sm">
                A new tab will open with the New Entry form already filled in.
                Select the business and contact, then save.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
