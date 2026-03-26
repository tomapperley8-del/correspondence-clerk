'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getUserProfile, updateDisplayName, type UserProfile } from '@/app/actions/user-profile'
import { getInboundEmailToken } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [inboundToken, setInboundToken] = useState<string | null>(null)
  const [lastEmailReceived, setLastEmailReceived] = useState<string | null>(null)
  const [sendingTest, setSendingTest] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    setIsLoading(true)

    // Get user email from auth
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      setUserEmail(user.email || '')
    }

    // Get user profile
    const result = await getUserProfile()

    if (result.error || !result.data) {
      setError(result.error || 'Failed to load profile')
      setIsLoading(false)
      return
    }

    setProfile(result.data)
    setDisplayName(result.data.display_name || '')

    // Load inbound email token
    const tokenResult = await getInboundEmailToken()
    if (tokenResult.data) {
      setInboundToken(tokenResult.data.token)
      setLastEmailReceived(tokenResult.data.lastReceivedAt)
    }

    setIsLoading(false)
  }

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!displayName.trim()) {
      setError('Display name cannot be empty')
      return
    }

    if (displayName.length > 100) {
      setError('Display name must be 100 characters or less')
      return
    }

    setIsSaving(true)
    const result = await updateDisplayName(displayName.trim())

    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setSuccess('Display name updated successfully')
      setProfile(result.data)
    }

    setIsSaving(false)
  }

  async function handleSendTest() {
    setSendingTest(true)
    try {
      const res = await fetch('/api/inbound-email/send-test', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        toast.error(`Could not send test email: ${data.error}`)
      } else {
        toast.success('Test email sent — check your Inbox queue in a moment')
      }
    } catch {
      toast.error('Failed to send test email')
    }
    setSendingTest(false)
  }

  function formatLastReceived(iso: string): string {
    const d = new Date(iso)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-600">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">User Settings</h1>
      <p className="text-gray-600 mb-8">
        Manage your personal profile and preferences.
      </p>

      {/* Navigation to other settings pages */}
      <div className="flex gap-2 mb-6 pb-6 border-b-2 border-gray-300">
        <Link
          href="/settings"
          className="px-4 py-2 bg-blue-600 text-white font-semibold border-2 border-blue-600"
        >
          User Profile
        </Link>
        <Link
          href="/settings/organization"
          className="px-4 py-2 bg-white text-gray-700 font-semibold border-2 border-gray-300 hover:border-blue-600"
        >
          Organization
        </Link>
        <Link
          href="/settings/billing"
          className="px-4 py-2 bg-white text-gray-700 font-semibold border-2 border-gray-300 hover:border-blue-600"
        >
          Billing
        </Link>
      </div>

      {error && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="border-2 border-green-600 bg-green-50 px-4 py-3 mb-6">
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {/* User Email (Read-only) */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Email Address</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your email address is managed by your authentication provider and cannot
          be changed here.
        </p>
        <div>
          <p className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Email address (cannot be changed)
          </p>
          <p className="text-sm text-brand-dark py-2">{userEmail}</p>
        </div>
      </div>

      {/* Display Name */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Display Name</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your display name is shown to other users and on correspondence entries
          you create. If not set, we will use the first part of your email
          address.
        </p>
        <form onSubmit={handleSaveDisplayName} className="space-y-4">
          <div>
            <Label htmlFor="displayName" className="block mb-2 font-semibold">
              Display Name
            </Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSaving}
              className="w-full"
              placeholder={
                userEmail ? userEmail.split('@')[0] : 'Your display name'
              }
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-2">
              {displayName.length}/100 characters
            </p>
          </div>
          <Button
            type="submit"
            disabled={isSaving || displayName === (profile?.display_name || '')}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {isSaving ? 'Saving...' : 'Save Display Name'}
          </Button>
        </form>
      </div>

      {/* Email Forwarding */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Email Forwarding</h2>
        <p className="text-sm text-gray-600 mb-5">
          Forward emails to your unique address and they&rsquo;ll appear in your{' '}
          <Link href="/inbox" className="underline" style={{ color: 'var(--brand-navy)' }}>Inbox</Link>{' '}
          for filing. Once you file an email from a domain, future emails from that domain auto-file.
        </p>

        {inboundToken ? (
          <>
            {/* Address display + copy */}
            <div className="flex items-center gap-2 mb-5">
              <code
                className="flex-1 text-sm px-3 py-2 rounded bg-gray-50 border border-gray-200 select-all"
                style={{ fontFamily: 'monospace', color: 'var(--brand-dark)' }}
              >
                {inboundToken}@in.correspondenceclerk.com
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${inboundToken}@in.correspondenceclerk.com`)
                  toast.success('Address copied')
                }}
                className="px-3 py-2 text-sm font-medium rounded border border-gray-300 hover:border-gray-500 transition-colors whitespace-nowrap"
                style={{ color: 'var(--brand-dark)' }}
              >
                Copy
              </button>
            </div>

            {/* Setup instructions */}
            <div className="space-y-3 mb-5">
              <details className="border border-gray-200 rounded">
                <summary
                  className="px-4 py-3 text-sm font-semibold cursor-pointer select-none"
                  style={{ color: 'var(--brand-dark)' }}
                >
                  Set up Gmail forwarding
                </summary>
                <ol className="px-4 pb-4 pt-2 space-y-2 text-sm text-gray-700 list-decimal list-inside">
                  <li>Open Gmail &rarr; Settings (gear icon) &rarr; <strong>See all settings</strong></li>
                  <li>Go to <strong>Forwarding and POP/IMAP</strong> &rarr; <strong>Add a forwarding address</strong></li>
                  <li>Paste your address above and confirm the verification email Gmail sends you</li>
                  <li>
                    Optional: create a Gmail filter (<strong>Filters and Blocked Addresses</strong> tab) to only
                    forward emails from specific senders or domains
                  </li>
                </ol>
              </details>

              <details className="border border-gray-200 rounded">
                <summary
                  className="px-4 py-3 text-sm font-semibold cursor-pointer select-none"
                  style={{ color: 'var(--brand-dark)' }}
                >
                  Set up Outlook forwarding
                </summary>
                <ol className="px-4 pb-4 pt-2 space-y-2 text-sm text-gray-700 list-decimal list-inside">
                  <li>Open Outlook &rarr; Settings (gear icon) &rarr; <strong>Mail</strong> &rarr; <strong>Forwarding</strong></li>
                  <li>Toggle <strong>Enable forwarding</strong> on and paste your address above</li>
                  <li>Click <strong>Save</strong> — all new incoming emails will forward automatically</li>
                  <li>
                    Alternative: use <strong>Rules</strong> to forward only emails from specific contacts
                    (Mail &rarr; Rules &rarr; Add new rule)
                  </li>
                </ol>
              </details>
            </div>

            {/* Test + status */}
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleSendTest}
                disabled={sendingTest}
                className="px-4 py-2 text-sm font-medium text-white rounded transition-colors"
                style={{
                  backgroundColor: sendingTest ? 'rgba(0,0,0,0.2)' : 'var(--brand-navy)',
                  cursor: sendingTest ? 'not-allowed' : 'pointer',
                }}
              >
                {sendingTest ? 'Sending…' : 'Send test email'}
              </button>
              <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
                {lastEmailReceived
                  ? `Last email received: ${formatLastReceived(lastEmailReceived)}`
                  : 'No emails received yet'}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Loading your inbound address…</p>
        )}
      </div>

      {/* Tools Section */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Tools</h2>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">
                Email Import Tool
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Install a bookmarklet to import emails directly from Outlook Web
                or Gmail with one click.
              </p>
            </div>
            <Link
              href="/bookmarklet"
              className="shrink-0 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 border-2 border-blue-600"
            >
              Install
            </Link>
          </div>
        </div>
      </div>

      {/* Back to Dashboard */}
      <Button
        variant="outline"
        onClick={() => router.push('/dashboard')}
        className="border-2 border-gray-800"
      >
        Back to Dashboard
      </Button>
    </div>
  )
}
