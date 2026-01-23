'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function BookmarkletPage() {
  const [bookmarkletCode, setBookmarkletCode] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [installed, setInstalled] = useState(false)
  const bookmarkletLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    // Fetch the bookmarklet code for the current environment
    fetch('/api/bookmarklet-code')
      .then((res) => res.json())
      .then((data) => {
        setBookmarkletCode(data.code)
      })
      .catch((err) => {
        console.error('Failed to fetch bookmarklet code:', err)
      })

    // Check if bookmarklet might be installed (basic heuristic)
    const hasBookmarkletStorage = localStorage.getItem('bookmarklet-installed')
    if (hasBookmarkletStorage) {
      setInstalled(true)
    }
  }, [])

  // Set the href directly via DOM after mount to bypass React's security check
  useEffect(() => {
    if (bookmarkletCode && bookmarkletLinkRef.current) {
      bookmarkletLinkRef.current.href = bookmarkletCode
    }
  }, [bookmarkletCode])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(bookmarkletCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMarkInstalled = () => {
    localStorage.setItem('bookmarklet-installed', 'true')
    setInstalled(true)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Install Email Import Tool</h1>

      {/* What it does */}
      <div className="bg-white border-2 border-gray-300 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">What This Tool Does</h2>
        <p className="text-gray-700 mb-4">
          The Email Import Tool is a bookmarklet that allows you to import emails
          directly from Outlook Web into Correspondence Clerk with one click.
        </p>
        <p className="text-gray-700">
          When you click the bookmarklet while viewing an email in Outlook Web,
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
                {bookmarkletCode ? (
                  <a
                    ref={bookmarkletLinkRef}
                    className="inline-block px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-move"
                    onClick={(e) => e.preventDefault()}
                    title="Drag this to your bookmarks bar"
                  >
                    📧 Import from Outlook
                  </a>
                ) : (
                  <div className="text-gray-500">Loading bookmarklet...</div>
                )}
              </div>
            </li>
            <li>
              Open an email in Outlook Web (outlook.office.com or outlook.live.com)
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
              Create a new bookmark in your browser (Right-click bookmarks bar →
              Add page)
            </li>
            <li>Name it "Import from Outlook" (or any name you prefer)</li>
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
              ✓ I've Installed the Bookmarklet
            </Button>
          ) : (
            <div className="text-center p-4 bg-green-50 border-2 border-green-600">
              <p className="text-green-800 font-semibold">
                ✓ Bookmarklet Installed
              </p>
              <p className="text-sm text-gray-700 mt-2">
                You can now import emails from Outlook Web with one click.
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
              "Please open this bookmarklet while viewing an email in Outlook
              Web"
            </h3>
            <p className="text-gray-700 text-sm">
              Make sure you are viewing an email in Outlook Web (outlook.office.com
              or outlook.live.com) when you click the bookmarklet. It will not
              work on other websites.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">
              "Could not load email extractor"
            </h3>
            <p className="text-gray-700 text-sm">
              This error means the bookmarklet cannot reach Correspondence Clerk.
              Make sure you are connected to the internet and that Correspondence
              Clerk is accessible.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">
              "Could not extract email data"
            </h3>
            <p className="text-gray-700 text-sm">
              Outlook Web may have updated its layout. Please report this issue
              and we will update the extractor script. In the meantime, you can
              manually copy and paste the email content into Correspondence Clerk.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Bookmarklet does nothing</h3>
            <p className="text-gray-700 text-sm">
              Check your browser console for errors (F12 → Console tab). Make
              sure you copied the entire bookmarklet code including the
              "javascript:" prefix.
            </p>
          </div>
        </div>
      </div>

      {/* Screenshot/Demo Section */}
      <div className="bg-white border-2 border-gray-300 p-6">
        <h2 className="text-xl font-semibold mb-4">How It Works</h2>
        <div className="space-y-4 text-gray-700">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold mb-1">Open an email in Outlook Web</h3>
              <p className="text-sm">
                Navigate to outlook.office.com or outlook.live.com and open any
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
